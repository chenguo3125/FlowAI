import {
  ArrowLeft,
  ArrowUp,
  BadgeCheck,
  ChevronRight,
  Lock,
  MessageSquareDashed,
  Shrink,
  Sparkles,
  TriangleAlert,
  Wrench,
} from 'lucide-react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'

import { contextTokens, estimateTokens, provider } from '@/ai/provider'
import { Markdown } from '@/components/Markdown'
import { MistakePanel } from '@/components/MistakePanel'
import { STATUS_META } from '@/lib/status'
import { plural, relativeTime } from '@/lib/text'
import { SIDEBAR_MIN, useSidebarResize } from '@/lib/useSidebarResize'
import { buildContext, selectSelectedNode, useCanvas } from '@/store/canvasStore'
import type { Message, Session } from '@/types'

export function ChatSidebar() {
  const node = useCanvas(selectSelectedNode)
  const tab = useCanvas((s) => s.sidebarTab)
  const setSidebarTab = useCanvas((s) => s.setSidebarTab)
  const reviewMode = useCanvas((s) => s.reviewMode)
  const exitReview = useCanvas((s) => s.exitReview)
  const openForNode = useCanvas((s) =>
    node ? s.misconceptions.filter((m) => m.nodeId === node.id && !m.resolved).length : 0,
  )

  if (!node) {
    if (reviewMode) {
      return (
        <SidebarShell>
          <div className="flex items-center justify-between border-b border-ink-800 px-4 py-3">
            <p className="text-[12px] font-semibold text-ink-200">Mistake graph</p>
            <button
              onClick={() => exitReview()}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11.5px] font-medium text-ink-300 ring-1 ring-ink-700 transition hover:bg-ink-850 hover:text-ink-100"
            >
              <ArrowLeft className="size-3" />
              Back to canvas
            </button>
          </div>
          <MistakePanel />
        </SidebarShell>
      )
    }
    return (
      <SidebarShell>
        <EmptyState />
      </SidebarShell>
    )
  }

  const meta = STATUS_META[node.data.status]

  return (
    <SidebarShell>
      <div className="border-b border-ink-800 px-4 pt-4 pb-3">
        <div className="flex items-start gap-2.5">
          <span className={`mt-1.5 size-2 shrink-0 rounded-full ${meta.dot}`} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {node.data.kind === 'correction' && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded bg-fix/15 px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wider text-fix uppercase ring-1 ring-fix/30">
                  <Wrench className="size-2.5" />
                  Generated fix
                </span>
              )}
              <NodeTitle id={node.id} title={node.data.title} />
            </div>
            <p className={`mt-0.5 text-[11.5px] ${meta.text}`}>{meta.label}</p>
          </div>
        </div>

        <div className="mt-3 flex gap-1 rounded-lg bg-ink-850 p-1 ring-1 ring-ink-800">
          <TabButton active={tab === 'chat'} onClick={() => setSidebarTab('chat')}>
            Micro-chat
          </TabButton>
          {reviewMode && (
            <TabButton active={tab === 'mistakes'} onClick={() => setSidebarTab('mistakes')}>
              Mistake graph
              {openForNode > 0 && (
                <span className="ml-1.5 rounded bg-gap/15 px-1.5 text-[10px] font-semibold text-gap">
                  {openForNode}
                </span>
              )}
            </TabButton>
          )}
        </div>
        {reviewMode && (
          <button
            onClick={() => exitReview()}
            className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-400 transition hover:text-ink-200"
          >
            <ArrowLeft className="size-3" />
            Back to canvas
          </button>
        )}
      </div>

      {tab === 'chat' || !reviewMode ? <ChatPane key={node.id} /> : <MistakePanel />}
    </SidebarShell>
  )
}

function SidebarShell({ children }: { children: React.ReactNode }) {
  const { width, reset, handleProps } = useSidebarResize()

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col border-l border-ink-800 bg-ink-900"
      style={{ width: 'var(--sidebar-w)' }}
    >
      <div
        {...handleProps}
        onDoubleClick={reset}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize chat panel"
        aria-valuenow={width}
        aria-valuemin={SIDEBAR_MIN}
        tabIndex={0}
        title="Drag to resize · double-click to reset"
        className="group absolute top-0 -left-1 z-10 flex h-full w-2.5 cursor-col-resize touch-none items-center justify-center outline-none"
      >
        <span className="h-14 w-0.5 rounded-full bg-transparent transition group-hover:bg-accent/70 group-focus-visible:bg-accent group-active:bg-accent" />
      </div>

      {children}
    </aside>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center rounded-md px-3 py-1.5 text-[12px] font-medium transition ${
        active
          ? 'bg-ink-700 text-ink-100 shadow-sm'
          : 'text-ink-400 hover:bg-ink-800 hover:text-ink-200'
      }`}
    >
      {children}
    </button>
  )
}

function NodeTitle({ id, title }: { id: string; title: string }) {
  const renameNode = useCanvas((s) => s.renameNode)
  const [draft, setDraft] = useState(title)
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false)
          if (draft.trim()) renameNode(id, draft.trim())
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setDraft(title)
            setEditing(false)
          }
        }}
        className="w-full rounded bg-ink-850 px-1.5 py-0.5 text-[15px] font-semibold text-ink-100 outline-none ring-1 ring-accent"
      />
    )
  }

  return (
    <h2
      className="cursor-text truncate text-[15px] font-semibold text-ink-100 hover:text-accent"
      title="Click to rename"
      onClick={() => {
        setDraft(title)
        setEditing(true)
      }}
    >
      {title}
    </h2>
  )
}

function ChatPane() {
  const node = useCanvas(selectSelectedNode)!
  const sendMessage = useCanvas((s) => s.sendMessage)
  const archiveSession = useCanvas((s) => s.archiveSession)
  const draft = useCanvas((s) => (s.streamDraft?.nodeId === node.id ? s.streamDraft.text : null))
  const busy = useCanvas((s) => s.streamDraft !== null)
  const highlightMessageId = useCanvas((s) => s.highlightMessageId)
  const clearHighlight = useCanvas((s) => s.clearHighlight)

  const [input, setInput] = useState('')
  const [openArchive, setOpenArchive] = useState<string[]>([])
  const [archiving, setArchiving] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)

  const prompts = useMemo(() => provider.suggestedPrompts(node.data.title), [node.data.title])

  const nodes = useCanvas((s) => s.nodes)
  const edges = useCanvas((s) => s.edges)

  const isolatedTokens = useMemo(() => {
    const context = buildContext(nodes, edges, node.id)
    return context ? contextTokens(context) : 0
  }, [nodes, edges, node.id])

  const linearTokens = useMemo(
    () =>
      estimateTokens(
        nodes
          .flatMap((n) => [
            ...n.data.sessions.flatMap((sess) => sess.messages.map((m) => m.content)),
            ...n.data.active.messages.map((m) => m.content),
          ])
          .join(' '),
      ),
    [nodes],
  )

  // Whichever archived thread holds the flagged message is force-expanded.
  const expandedArchive = useMemo(() => {
    const owner = highlightMessageId
      ? node.data.sessions.find((s) => s.messages.some((m) => m.id === highlightMessageId))
      : undefined
    return owner && !openArchive.includes(owner.id) ? [...openArchive, owner.id] : openArchive
  }, [highlightMessageId, node.data.sessions, openArchive])

  // Runs again after the owning thread expands, once the ref exists to scroll to.
  useLayoutEffect(() => {
    if (!highlightMessageId || !highlightRef.current) return undefined
    highlightRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const timer = setTimeout(clearHighlight, 2800)
    return () => clearTimeout(timer)
  }, [highlightMessageId, expandedArchive, clearHighlight])

  useLayoutEffect(() => {
    if (highlightMessageId) return
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [highlightMessageId, node.data.active.messages.length, draft])

  const submit = () => {
    const text = input
    if (!text.trim() || busy) return
    setInput('')
    void sendMessage(node.id, text)
  }

  return (
    <>
      <div
        className="flex items-center gap-2 border-b border-ink-800 bg-ink-850/60 px-4 py-2"
        title="Sent to the model: this node's title, gist, ancestor titles, one summary per compressed thread, and the live messages. Nothing from other nodes."
      >
        <Lock className="size-3 shrink-0 text-accent" />
        <span className="text-[11px] text-ink-400">
          Isolated context ·{' '}
          <span className="font-semibold text-ink-200">~{isolatedTokens.toLocaleString()} tok</span>
        </span>
        <span className="ml-auto text-[11px] text-ink-500">
          linear chat would send ~{linearTokens.toLocaleString()} ·{' '}
          <span className="font-semibold text-solid">
            {Math.max(1, Math.round(linearTokens / Math.max(isolatedTokens, 1)))}× lighter
          </span>
        </span>
      </div>

      <div ref={scrollRef} className="scrollbar-slim flex-1 overflow-y-auto px-4 py-4">
        {node.data.sessions.length > 0 && (
          <div className="mb-4 space-y-1.5">
            <div className="text-[9.5px] font-semibold tracking-wider text-ink-500 uppercase">
              {plural(node.data.sessions.length, 'compressed thread')}
            </div>
            {node.data.sessions.map((session) => (
              <ArchivedThread
                key={session.id}
                session={session}
                expanded={expandedArchive.includes(session.id)}
                highlightMessageId={highlightMessageId}
                highlightRef={highlightRef}
                onToggle={() =>
                  setOpenArchive((prev) =>
                    expandedArchive.includes(session.id)
                      ? prev.filter((x) => x !== session.id)
                      : [...prev, session.id],
                  )
                }
              />
            ))}
          </div>
        )}

        {node.data.active.messages.length === 0 && !draft ? (
          <div className="mt-6 text-center">
            <MessageSquareDashed className="mx-auto size-7 text-ink-600" />
            <p className="mt-2 text-[13px] text-ink-400">
              Fresh thread on <span className="text-ink-200">{node.data.title}</span>
            </p>
            <p className="mt-1 text-[11.5px] text-ink-500">
              This chat only ever sees this node. Nothing from other nodes leaks in.
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {node.data.active.messages.map((m) => (
              <Bubble
                key={m.id}
                message={m}
                highlighted={m.id === highlightMessageId}
                ref={m.id === highlightMessageId ? highlightRef : undefined}
              />
            ))}
            {draft !== null && (
              <div className="animate-rise">
                <RoleLabel role="assistant" />
                <div className="rounded-xl rounded-tl-sm bg-ink-850 px-3.5 py-2.5 ring-1 ring-ink-800">
                  {draft ? (
                    <Markdown text={draft} />
                  ) : (
                    <span className="inline-flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="size-1.5 animate-bounce rounded-full bg-ink-500"
                          style={{ animationDelay: `${i * 120}ms` }}
                        />
                      ))}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-ink-800 px-4 py-3">
        {node.data.active.messages.length === 0 && (
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {prompts.map((p) => (
              <button
                key={p}
                onClick={() => setInput(p)}
                className="inline-flex items-center gap-1 rounded-full bg-ink-850 px-2.5 py-1 text-[11px] text-ink-300 ring-1 ring-ink-700 transition hover:bg-ink-800 hover:text-ink-100"
              >
                <Sparkles className="size-2.5 text-accent" />
                {p}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 rounded-xl bg-ink-850 p-2 ring-1 ring-ink-700 focus-within:ring-accent/60">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={`Ask about ${node.data.title}…`}
            className="scrollbar-slim max-h-32 min-h-8 flex-1 resize-none bg-transparent px-1.5 py-1 text-[13px] text-ink-200 outline-none placeholder:text-ink-500"
          />
          <button
            onClick={submit}
            disabled={!input.trim() || busy}
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-ink-950 transition hover:brightness-110 disabled:bg-ink-700 disabled:text-ink-500"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10.5px] text-ink-500">
            Enter to send · Shift+Enter for newline
          </span>
          <button
            disabled={node.data.active.messages.length === 0 || archiving || busy}
            onClick={async () => {
              setArchiving(true)
              try {
                await archiveSession(node.id)
              } finally {
                setArchiving(false)
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-ink-300 ring-1 ring-ink-700 transition hover:bg-ink-850 hover:text-ink-100 disabled:opacity-40"
            title="Summarize this thread into an accordion bubble on the canvas"
          >
            <Shrink className="size-3" />
            {archiving ? 'Compressing…' : 'Compress to bubble'}
          </button>
        </div>
      </div>
    </>
  )
}

function RoleLabel({ role }: { role: Message['role'] }) {
  return (
    <div
      className={`mb-1 text-[9.5px] font-semibold tracking-wider uppercase ${
        role === 'user' ? 'text-right text-accent' : 'text-ink-500'
      }`}
    >
      {role === 'user' ? 'You' : 'FlowAI'}
    </div>
  )
}

function Bubble({
  message,
  highlighted,
  ref,
}: {
  message: Message
  highlighted?: boolean
  ref?: React.Ref<HTMLDivElement>
}) {
  const isUser = message.role === 'user'
  // A flag on a closed gap is history, not an open warning, so it cools off.
  const flagOpen = useCanvas((s) =>
    message.flaggedBy
      ? s.misconceptions.some((m) => m.id === message.flaggedBy && !m.resolved)
      : false,
  )

  return (
    <div ref={ref} className="animate-rise">
      <RoleLabel role={message.role} />
      <div
        className={[
          'rounded-xl px-3.5 py-2.5 ring-1 transition-shadow',
          isUser
            ? 'ml-8 rounded-tr-sm bg-accent/10 ring-accent/25'
            : 'rounded-tl-sm bg-ink-850 ring-ink-800',
          message.flaggedBy && flagOpen ? '!ring-gap/60 !bg-gap/8' : '',
          highlighted ? 'glow-flag ring-2 !ring-gap' : '',
        ].join(' ')}
      >
        {message.flaggedBy && (
          <div
            className={`mb-1.5 flex items-center gap-1 text-[10px] font-semibold tracking-wide uppercase ${
              flagOpen ? 'text-gap' : 'text-ink-500'
            }`}
          >
            {flagOpen ? <TriangleAlert className="size-2.5" /> : <BadgeCheck className="size-2.5" />}
            {flagOpen ? 'flagged by analyzer' : 'was flagged · corrected'}
          </div>
        )}
        <Markdown text={message.content} />
      </div>
    </div>
  )
}

function ArchivedThread({
  session,
  expanded,
  onToggle,
  highlightMessageId,
  highlightRef,
}: {
  session: Session
  expanded: boolean
  onToggle: () => void
  highlightMessageId: string | null
  highlightRef: React.Ref<HTMLDivElement>
}) {
  const origin = session.origin
  const fromFix = origin?.kind === 'correction'

  return (
    <div
      className={`overflow-hidden rounded-xl ring-1 ${
        fromFix
          ? expanded
            ? 'bg-fix/10 ring-fix/40'
            : 'bg-fix/5 ring-fix/25 hover:ring-fix/45'
          : expanded
            ? 'bg-ink-850/70 ring-ink-700'
            : 'bg-ink-850/40 ring-ink-800 hover:ring-ink-700'
      }`}
    >
      <button onClick={onToggle} className="flex w-full items-start gap-2 px-3 py-2 text-left">
        <ChevronRight
          className={`mt-0.5 size-3.5 shrink-0 transition-transform duration-200 ${
            expanded ? 'rotate-90' : ''
          } ${fromFix ? 'text-fix' : 'text-ink-500'}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            {fromFix && <Wrench className="size-3 shrink-0 translate-y-0.5 text-fix" />}
            <span
              className={`truncate text-[12.5px] font-medium ${
                fromFix ? 'text-fix' : 'text-ink-200'
              }`}
            >
              {session.title}
            </span>
            <span className="ml-auto shrink-0 text-[10px] text-ink-600">
              {session.messages.length} msgs ·{' '}
              {session.closedAt ? relativeTime(session.closedAt) : ''}
            </span>
          </div>
          {!expanded && (
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink-500">
              {session.summary}
            </p>
          )}
        </div>
      </button>

      {expanded && (
        <div className="animate-rise px-3 pb-3">
          {fromFix && origin && (
            <p className="mb-2 text-[10.5px] text-fix/90">
              Folded in from the drill node “{origin.fromNodeTitle}” when you closed this gap.
            </p>
          )}
          <p
            className={`mb-3 rounded-lg px-2.5 py-2 text-[11.5px] leading-snug text-ink-300 ring-1 ${
              fromFix ? 'bg-fix/8 ring-fix/20' : 'bg-accent/8 ring-accent/15'
            }`}
          >
            {session.summary}
          </p>
          <div className="space-y-3">
            {session.messages.map((m) => (
              <Bubble
                key={m.id}
                message={m}
                highlighted={m.id === highlightMessageId}
                ref={m.id === highlightMessageId ? highlightRef : undefined}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-10 text-center">
      <div className="grid size-12 place-items-center rounded-xl bg-ink-850 ring-1 ring-ink-700">
        <MessageSquareDashed className="size-5 text-ink-500" />
      </div>
      <h2 className="text-[14px] font-semibold text-ink-200">No node selected</h2>
      <p className="text-[12px] leading-relaxed text-ink-400">
        Click any node on the canvas to open its private micro-chat. Each node keeps its own
        conversation, so switching nodes swaps the AI's entire context instead of piling onto one
        thread.
      </p>
    </div>
  )
}
