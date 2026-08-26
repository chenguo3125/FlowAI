import {
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type Connection,
} from '@xyflow/react'
import { nanoid } from 'nanoid'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import { provider, type AnalyzeTarget, type ChatRequest } from '@/ai/provider'
import { quoteOccursIn } from '@/ai/llm/heuristic'
import { idbStorage } from '@/data/idbStorage'
import { seedCanvas } from '@/data/seed'
import { correctionDigest, threadDigest } from '@/lib/digest'
import type {
  AnalyzerRun,
  MasteryStatus,
  Message,
  Misconception,
  NodeData,
  NodeGhost,
  Session,
} from '@/types'

export type FlowNode = Node<NodeData>

export const NODE_WIDTH = 304

/** How long a removed correction node's ghost lingers before fading out. */
export const GHOST_TTL = 7000

export function newSession(title = 'Live thread'): Session {
  return { id: nanoid(8), title, summary: '', messages: [], createdAt: Date.now() }
}

export function makeMessage(role: Message['role'], content: string): Message {
  return { id: nanoid(8), role, content, createdAt: Date.now() }
}

export function makeNodeData(
  title: string,
  gist: string,
  overrides: Partial<NodeData> = {},
): NodeData {
  return {
    title,
    gist,
    kind: 'topic',
    status: 'unexplored',
    sessions: [],
    active: newSession(),
    expandedSessions: [],
    createdAt: Date.now(),
    ...overrides,
  }
}

interface CanvasState {
  nodes: FlowNode[]
  edges: Edge[]
  selectedNodeId: string | null
  misconceptions: Misconception[]
  lastRun: AnalyzerRun | null
  /** Stamp written on every persist. Used to compare with a Firestore copy. */
  savedAt: number

  /** In-flight assistant text, kept out of `nodes` so streaming doesn't rerender the canvas. */
  streamDraft: { nodeId: string; sessionId: string; text: string } | null
  /** Fading traces of removed correction nodes. Never persisted. */
  ghosts: NodeGhost[]
  analyzing: boolean
  /**
   * Analyzer review overlay. Findings stay in the ledger; this flag only
   * controls whether fix nodes, status colours, and the mistake graph are shown.
   */
  reviewMode: boolean
  sidebarTab: 'chat' | 'mistakes'
  /** Message the user asked to jump to from the Mistake Graph. */
  highlightMessageId: string | null

  onNodesChange: (changes: NodeChange<FlowNode>[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void

  selectNode: (id: string | null) => void
  setSidebarTab: (tab: 'chat' | 'mistakes') => void
  addNode: (position: { x: number; y: number }, title?: string) => string
  renameNode: (id: string, title: string) => void
  deleteNode: (id: string) => void

  sendMessage: (nodeId: string, text: string) => Promise<void>
  archiveSession: (nodeId: string) => Promise<void>
  toggleSessionExpanded: (nodeId: string, sessionId: string) => void

  runAnalyzer: () => Promise<number>
  enterReview: () => void
  exitReview: () => void
  resolveMisconception: (id: string) => Promise<void>
  dismissGhost: (id: string) => void
  jumpToEvidence: (m: Misconception) => void
  clearHighlight: () => void

  resetCanvas: () => void
}

function patchNode(nodes: FlowNode[], id: string, patch: (data: NodeData) => NodeData): FlowNode[] {
  return nodes.map((n) => (n.id === id ? { ...n, data: patch(n.data) } : n))
}

/**
 * Appends to a session by id, wherever it currently lives.
 *
 * Streaming replies must land in the thread they were asked in, and that thread
 * can move mid-flight — compressing to a bubble or resolving a gap both relocate
 * it. Targeting the node's *current* active session instead would split the
 * exchange: question in the moved thread, answer in the empty one left behind.
 */
function appendToSession(nodes: FlowNode[], sessionId: string, message: Message): FlowNode[] {
  return nodes.map((n) => {
    if (n.data.active.id === sessionId) {
      return {
        ...n,
        data: { ...n.data, active: { ...n.data.active, messages: [...n.data.active.messages, message] } },
      }
    }
    if (!n.data.sessions.some((s) => s.id === sessionId)) return n
    return {
      ...n,
      data: {
        ...n.data,
        sessions: n.data.sessions.map((s) =>
          s.id === sessionId ? { ...s, messages: [...s.messages, message] } : s,
        ),
      },
    }
  })
}

function patchSession(
  nodes: FlowNode[],
  sessionId: string,
  patch: (session: Session) => Session,
): FlowNode[] {
  return nodes.map((n) =>
    n.data.sessions.some((s) => s.id === sessionId)
      ? {
          ...n,
          data: {
            ...n.data,
            sessions: n.data.sessions.map((s) => (s.id === sessionId ? patch(s) : s)),
          },
        }
      : n,
  )
}

/**
 * Node colour is always derived from open misconceptions, never set by hand —
 * so the canvas can't drift out of sync with the Mistake Graph.
 */
function deriveStatus(node: FlowNode, misconceptions: Misconception[]): MasteryStatus {
  const open = misconceptions.filter((m) => m.nodeId === node.id && !m.resolved)
  if (open.some((m) => m.severity === 'high')) return 'gap'
  if (open.length > 0) return 'shaky'
  const turns = node.data.sessions.reduce(
    (n, s) => n + s.messages.length,
    node.data.active.messages.length,
  )
  return turns === 0 ? 'unexplored' : 'solid'
}

function knownClaimKey(m: Misconception): string {
  // Older persisted rows predate `claimId`; recover it from the instance id.
  return `${m.claimId ?? m.id.split('__')[0]}:${m.nodeId}`
}

function messagesOn(node: FlowNode): Message[] {
  return [...node.data.sessions.flatMap((s) => s.messages), ...node.data.active.messages]
}

function recolor(nodes: FlowNode[], misconceptions: Misconception[]): FlowNode[] {
  return nodes.map((n) => {
    const status = deriveStatus(n, misconceptions)
    return status === n.data.status ? n : { ...n, data: { ...n.data, status } }
  })
}

/**
 * React Flow attaches measured size and internal lookups after mount. Those
 * must not go into storage — `internals` can circular-reference the user node,
 * JSON.stringify throws, and persist fails silently. Firestore also rejects
 * `undefined` fields, so only defined keys are copied.
 */
export function toStoredNodes(nodes: FlowNode[]): FlowNode[] {
  return nodes.map((n) => {
    const stored: FlowNode = {
      id: n.id,
      type: n.type,
      position: { x: n.position.x, y: n.position.y },
      data: n.data,
    }
    if (n.selected != null) stored.selected = n.selected
    if (n.hidden != null) stored.hidden = n.hidden
    if (n.sourcePosition != null) stored.sourcePosition = n.sourcePosition
    if (n.targetPosition != null) stored.targetPosition = n.targetPosition
    return stored
  })
}

export function toStoredEdges(edges: Edge[]): Edge[] {
  return edges.map((e) => {
    const stored: Edge = {
      id: e.id,
      source: e.source,
      target: e.target,
    }
    if (e.sourceHandle != null) stored.sourceHandle = e.sourceHandle
    if (e.targetHandle != null) stored.targetHandle = e.targetHandle
    if (e.type != null) stored.type = e.type
    if (e.animated != null) stored.animated = e.animated
    if (e.className != null) stored.className = e.className
    return stored
  })
}

/** Nudges a candidate position downward until it isn't sitting on top of a node. */
function freeSpot(nodes: FlowNode[], x: number, y: number) {
  let pos = { x, y }
  let guard = 0
  while (
    guard++ < 40 &&
    nodes.some(
      (n) => Math.abs(n.position.x - pos.x) < NODE_WIDTH - 40 && Math.abs(n.position.y - pos.y) < 150,
    )
  ) {
    pos = { x: pos.x, y: pos.y + 96 }
  }
  return pos
}

/**
 * The exact payload the provider receives for a node. Shared by `sendMessage`
 * and the sidebar's context meter so the displayed weight can't drift from the
 * real request.
 */
export function buildContext(
  nodes: FlowNode[],
  edges: Edge[],
  nodeId: string,
): Omit<ChatRequest, 'userMessage'> | null {
  const node = nodes.find((n) => n.id === nodeId)
  if (!node) return null
  return {
    nodeId,
    nodeTitle: node.data.title,
    nodeGist: node.data.gist,
    history: node.data.active.messages,
    priorSummaries: node.data.sessions.map((s) => s.summary),
    ancestorTitles: ancestorTitles(nodes, edges, nodeId),
  }
}

function ancestorTitles(nodes: FlowNode[], edges: Edge[], nodeId: string): string[] {
  const trail: string[] = []
  const seen = new Set<string>([nodeId])
  let current = nodeId
  for (let hop = 0; hop < 8; hop++) {
    const parentEdge = edges.find((e) => e.target === current)
    if (!parentEdge || seen.has(parentEdge.source)) break
    const parent = nodes.find((n) => n.id === parentEdge.source)
    if (!parent) break
    trail.unshift(parent.data.title)
    seen.add(parent.id)
    current = parent.id
  }
  return trail
}

export const useCanvas = create<CanvasState>()(
  persist(
    (set, get) => ({
      ...seedCanvas(),
      streamDraft: null,
      ghosts: [],
      analyzing: false,
      reviewMode: false,
      sidebarTab: 'chat',
      highlightMessageId: null,
      savedAt: 0,

      onNodesChange: (changes) =>
        set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) })),

      onEdgesChange: (changes) => set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),

      onConnect: ({ source, target, sourceHandle, targetHandle }) =>
        set((s) => {
          if (!source || !target || source === target) return s
          if (s.edges.some((e) => e.source === source && e.target === target)) return s
          return {
            edges: [
              ...s.edges,
              {
                id: `e-${source}-${target}`,
                source,
                target,
                sourceHandle,
                targetHandle,
                type: 'smoothstep',
              },
            ],
          }
        }),

      selectNode: (id) => set({ selectedNodeId: id, sidebarTab: 'chat', highlightMessageId: null }),
      setSidebarTab: (sidebarTab) => set({ sidebarTab }),

      addNode: (position, title = 'New topic') => {
        const id = nanoid(8)
        set((s) => ({
          nodes: [
            ...s.nodes,
            {
              id,
              type: 'topic',
              position: freeSpot(s.nodes, position.x, position.y),
              data: makeNodeData(title, 'No conversation yet.'),
            },
          ],
          selectedNodeId: id,
          sidebarTab: 'chat',
        }))
        return id
      },

      renameNode: (id, title) =>
        set((s) => ({ nodes: patchNode(s.nodes, id, (d) => ({ ...d, title })) })),

      deleteNode: (id) =>
        set((s) => ({
          nodes: s.nodes.filter((n) => n.id !== id),
          edges: s.edges.filter((e) => e.source !== id && e.target !== id),
          misconceptions: s.misconceptions.filter((m) => m.nodeId !== id),
          selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
        })),

      sendMessage: async (nodeId, text) => {
        const trimmed = text.trim()
        if (!trimmed || get().streamDraft) return
        const node = get().nodes.find((n) => n.id === nodeId)
        const context = buildContext(get().nodes, get().edges, nodeId)
        if (!node || !context) return

        // Bind to the session, not the node: it may relocate before we finish.
        const sessionId = node.data.active.id
        const userMsg = makeMessage('user', trimmed)
        set((s) => ({
          nodes: recolor(appendToSession(s.nodes, sessionId, userMsg), s.misconceptions),
          streamDraft: { nodeId, sessionId, text: '' },
        }))

        let reply: Message
        try {
          // Only this node's context crosses the boundary — that's the isolation.
          const full = await provider.stream({ ...context, userMessage: trimmed }, (chunk) =>
            set((s) =>
              s.streamDraft?.sessionId === sessionId
                ? { streamDraft: { ...s.streamDraft, text: s.streamDraft.text + chunk } }
                : s,
            ),
          )
          reply = makeMessage('assistant', full)
        } catch (error) {
          // A provider that throws must not strand streamDraft: the guard above
          // is global, so a stuck draft would disable sending on every node.
          reply = makeMessage(
            'assistant',
            `_The tutor could not be reached._\n\n${
              error instanceof Error ? error.message : 'Unknown error'
            }\n\nYour question is saved — send it again to retry.`,
          )
        }

        set((s) => ({
          nodes: recolor(appendToSession(s.nodes, sessionId, reply), s.misconceptions),
          streamDraft: null,
        }))
      },

      archiveSession: async (nodeId) => {
        const node = get().nodes.find((n) => n.id === nodeId)
        if (!node || node.data.active.messages.length === 0) return

        // Move first on a deterministic digest, enrich after. Awaiting the model
        // before moving would mean a failed call loses the compression entirely.
        const closing = node.data.active
        const fallback = threadDigest(node.data.title, closing.messages)

        set((s) => ({
          nodes: patchNode(s.nodes, nodeId, (d) => ({
            ...d,
            sessions: [
              ...d.sessions,
              { ...closing, ...fallback, closedAt: Date.now(), summaryPending: true },
            ],
            active: newSession(),
          })),
        }))

        try {
          const written = await provider.summarize({
            nodeTitle: node.data.title,
            messages: closing.messages,
          })
          set((s) => ({
            nodes: patchSession(s.nodes, closing.id, (sess) => ({
              ...sess,
              ...written,
              summaryPending: false,
            })),
          }))
        } catch {
          // Keep the deterministic digest; the thread is already safely stored.
          set((s) => ({
            nodes: patchSession(s.nodes, closing.id, (sess) => ({
              ...sess,
              summaryPending: false,
            })),
          }))
        }
      },

      toggleSessionExpanded: (nodeId, sessionId) =>
        set((s) => ({
          nodes: patchNode(s.nodes, nodeId, (d) => ({
            ...d,
            expandedSessions: d.expandedSessions.includes(sessionId)
              ? d.expandedSessions.filter((x) => x !== sessionId)
              : [...d.expandedSessions, sessionId],
          })),
        })),

      runAnalyzer: async () => {
        if (get().analyzing) return 0
        set({ analyzing: true })

        const { nodes, misconceptions } = get()
        // Generated drill nodes quote the misconception back at the learner, so
        // scanning them would flag the cure as a symptom.
        const targets: AnalyzeTarget[] = nodes
          .filter((n) => n.data.kind !== 'correction')
          .map((n) => ({
            nodeId: n.id,
            nodeTitle: n.data.title,
            messages: [...n.data.sessions.flatMap((s) => s.messages), ...n.data.active.messages],
          }))
        const known = new Set(misconceptions.map(knownClaimKey))

        try {
          const drafts = await provider.analyze(targets, known)

          set((s) => {
            let nextNodes = [...s.nodes]
            const found: Misconception[] = []

            drafts.forEach((draft, i) => {
              const parent = nextNodes.find((n) => n.id === draft.nodeId)
              if (!parent) return

              const evidenceMsg = messagesOn(parent).find((m) => m.id === draft.evidenceMessageId)
              if (!evidenceMsg || evidenceMsg.role !== 'user') return
              if (!quoteOccursIn(draft.evidenceQuote, evidenceMsg)) return

              const misId = `${draft.ruleId}__${nanoid(5)}`
              const fixId = nanoid(8)
              const seeded = newSession('Live thread')
              seeded.messages = [
                makeMessage('user', draft.drillQuestion),
                makeMessage('assistant', draft.drillAnswer),
              ]

              nextNodes.push({
                id: fixId,
                type: 'topic',
                position: freeSpot(
                  nextNodes,
                  parent.position.x + NODE_WIDTH + 96,
                  parent.position.y + 40 + i * 40,
                ),
                data: makeNodeData(draft.fixTitle, draft.correction, {
                  kind: 'correction',
                  active: seeded,
                  fixesMisconceptionId: misId,
                }),
              })

              // Tag the message that gave the misconception away.
              nextNodes = patchNode(nextNodes, draft.nodeId, (d) => ({
                ...d,
                sessions: d.sessions.map((sess) => ({
                  ...sess,
                  messages: sess.messages.map((m) =>
                    m.id === draft.evidenceMessageId ? { ...m, flaggedBy: misId } : m,
                  ),
                })),
                active: {
                  ...d.active,
                  messages: d.active.messages.map((m) =>
                    m.id === draft.evidenceMessageId ? { ...m, flaggedBy: misId } : m,
                  ),
                },
              }))

              found.push({
                id: misId,
                claimId: draft.ruleId,
                nodeId: draft.nodeId,
                concept: draft.concept,
                belief: draft.belief,
                correction: draft.correction,
                severity: draft.severity,
                evidenceMessageId: draft.evidenceMessageId,
                evidenceQuote: draft.evidenceQuote,
                correctionNodeId: fixId,
                detectedAt: Date.now(),
                resolved: false,
              })
            })

            const nextMis = [...s.misconceptions, ...found]
            const newEdges: Edge[] = found.map((m) => ({
              id: `e-${m.nodeId}-${m.correctionNodeId}`,
              source: m.nodeId,
              target: m.correctionNodeId!,
              sourceHandle: 'r',
              targetHandle: 'l',
              type: 'smoothstep',
              animated: true,
              // Coloured in CSS so stored edges follow the active theme.
              className: `edge-severity-${m.severity}`,
            }))

            return {
              nodes: recolor(nextNodes, nextMis),
              edges: [...s.edges, ...newEdges],
              misconceptions: nextMis,
              lastRun: {
                id: nanoid(6),
                ranAt: Date.now(),
                messagesScanned: targets.reduce((n, t) => n + t.messages.length, 0),
                nodesScanned: targets.length,
                found: found.map((m) => m.id),
              },
              sidebarTab: found.length > 0 ? 'mistakes' : s.sidebarTab,
              reviewMode: true,
            }
          })

          return drafts.length
        } finally {
          set({ analyzing: false })
        }
      },

      enterReview: () =>
        set({ reviewMode: true, sidebarTab: 'mistakes' }),

      exitReview: () => {
        const s = get()
        const selected = s.nodes.find((n) => n.id === s.selectedNodeId)
        const parentId =
          selected?.data.kind === 'correction'
            ? (s.misconceptions.find((m) => m.correctionNodeId === selected.id)?.nodeId ?? null)
            : s.selectedNodeId
        set({
          reviewMode: false,
          sidebarTab: 'chat',
          selectedNodeId: parentId,
          highlightMessageId: null,
        })
      },

      /**
       * Closes a gap and folds the drill conversation into the parent topic,
       * where it belongs at revision time. The correction node is removed and
       * leaves a fading ghost as acknowledgement.
       */
      resolveMisconception: async (id) => {
        const state = get()
        const m = state.misconceptions.find((x) => x.id === id)
        if (!m || m.resolved) return // idempotent under double-click and retries

        const parent = state.nodes.find((n) => n.id === m.nodeId)
        const drill = m.correctionNodeId
          ? state.nodes.find((n) => n.id === m.correctionNodeId)
          : undefined

        // Nothing to fold in: just close the gap.
        if (!parent || !drill || drill.data.active.messages.length === 0) {
          set((s) => {
            const misconceptions = s.misconceptions.map((x) =>
              x.id === id ? { ...x, resolved: true } : x,
            )
            return { misconceptions, nodes: recolor(s.nodes, misconceptions) }
          })
          return
        }

        const moved: Session = {
          ...drill.data.active,
          ...correctionDigest(m.concept, drill.data.active.messages),
          closedAt: Date.now(),
          summaryPending: true,
          origin: {
            kind: 'correction',
            misconceptionId: m.id,
            concept: m.concept,
            fromNodeTitle: drill.data.title,
          },
        }

        set((s) => {
          const misconceptions = s.misconceptions.map((x) =>
            x.id === id ? { ...x, resolved: true } : x,
          )
          const withMoved = patchNode(s.nodes, parent.id, (d) => ({
            ...d,
            sessions: [...d.sessions, moved],
            // Open it straight away so the fold-in is visible on the canvas.
            expandedSessions: [...d.expandedSessions, moved.id],
          }))

          return {
            misconceptions,
            nodes: recolor(
              withMoved.filter((n) => n.id !== drill.id),
              misconceptions,
            ),
            edges: s.edges.filter((e) => e.source !== drill.id && e.target !== drill.id),
            ghosts: [
              ...s.ghosts,
              {
                id: drill.id,
                title: drill.data.title,
                position: drill.position,
                createdAt: Date.now(),
              },
            ],
            selectedNodeId: s.selectedNodeId === drill.id ? parent.id : s.selectedNodeId,
          }
        })

        window.setTimeout(() => get().dismissGhost(drill.id), GHOST_TTL)

        try {
          const written = await provider.summarizeCorrection({
            concept: m.concept,
            belief: m.belief,
            correction: m.correction,
            messages: moved.messages,
          })
          set((s) => ({
            nodes: patchSession(s.nodes, moved.id, (sess) => ({
              ...sess,
              ...written,
              summaryPending: false,
            })),
          }))
        } catch {
          set((s) => ({
            nodes: patchSession(s.nodes, moved.id, (sess) => ({
              ...sess,
              summaryPending: false,
            })),
          }))
        }
      },

      dismissGhost: (id) => set((s) => ({ ghosts: s.ghosts.filter((g) => g.id !== id) })),

      jumpToEvidence: (m) =>
        set({
          reviewMode: true,
          selectedNodeId: m.nodeId,
          sidebarTab: 'chat',
          highlightMessageId: m.evidenceMessageId ?? null,
        }),

      clearHighlight: () => set({ highlightMessageId: null }),

      resetCanvas: () =>
        set({
          ...seedCanvas(),
          streamDraft: null,
          ghosts: [],
          analyzing: false,
          reviewMode: false,
          sidebarTab: 'chat',
          highlightMessageId: null,
          savedAt: Date.now(),
        }),
    }),
    {
      // v3: IndexedDB. v2 lived in localStorage and was evicted once MiniLM
      // vectors filled the ~5 MB quota, which is why new nodes vanished on
      // refresh. idbStorage copies v2 across on first read.
      name: 'flowai.canvas.v3',
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({
        nodes: toStoredNodes(s.nodes),
        edges: toStoredEdges(s.edges),
        selectedNodeId: s.selectedNodeId,
        misconceptions: s.misconceptions,
        lastRun: s.lastRun,
        reviewMode: s.reviewMode,
        savedAt: Date.now(),
      }),
    },
  ),
)

export const selectSelectedNode = (s: CanvasState) =>
  s.nodes.find((n) => n.id === s.selectedNodeId) ?? null

export const selectOpenMisconceptions = (s: CanvasState) =>
  s.misconceptions.filter((m) => !m.resolved)
