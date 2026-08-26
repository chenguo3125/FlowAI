import type { Message } from '@/types'
import {
  GENERIC_REPLIES,
  MISCONCEPTION_RULES,
  TOPICS,
  type MisconceptionRule,
  type TopicEntry,
} from './knowledge'

/**
 * Everything the model is allowed to see for one node's micro-chat.
 *
 * This shape *is* the context-isolation guarantee. `history` only ever holds the
 * selected node's live thread; closed threads enter as one-line summaries rather
 * than full transcripts; ancestors contribute titles as a breadcrumb and nothing
 * more. Swapping in a real LLM means implementing `AIProvider` against the same
 * boundary.
 */
export interface ChatRequest {
  nodeId: string
  nodeTitle: string
  nodeGist: string
  history: Message[]
  /** Compressed stand-ins for this node's closed threads. */
  priorSummaries: string[]
  userMessage: string
  ancestorTitles: string[]
}

export interface SummarizeRequest {
  nodeTitle: string
  messages: Message[]
}

/**
 * Summarising a drill thread is a different job from recapping a topic: the
 * durable artifact is the belief that was wrong and what corrected it, since
 * that is what the learner needs at revision time.
 */
export interface CorrectionSummarizeRequest {
  concept: string
  belief: string
  correction: string
  messages: Message[]
}

export interface AnalyzeTarget {
  nodeId: string
  nodeTitle: string
  messages: Message[]
}

export interface MisconceptionDraft {
  ruleId: string
  nodeId: string
  concept: string
  belief: string
  correction: string
  severity: 'high' | 'medium'
  evidenceMessageId: string
  evidenceQuote: string
  fixTitle: string
  drillQuestion: string
  drillAnswer: string
}

export interface AIProvider {
  id: string
  label: string
  stream(req: ChatRequest, onToken: (chunk: string) => void): Promise<string>
  summarize(req: SummarizeRequest): Promise<{ title: string; summary: string }>
  summarizeCorrection(
    req: CorrectionSummarizeRequest,
  ): Promise<{ title: string; summary: string }>
  analyze(targets: AnalyzeTarget[], knownRuleKeys: Set<string>): Promise<MisconceptionDraft[]>
  suggestedPrompts(nodeTitle: string): string[]
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Rough token estimate, used to show context weight in the UI. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4)

/** Exactly what `stream` will be handed, so the UI can show the true weight. */
export function contextTokens(
  req: Pick<ChatRequest, 'history' | 'nodeTitle' | 'nodeGist' | 'priorSummaries' | 'ancestorTitles'>,
) {
  return estimateTokens(
    [
      req.nodeTitle,
      req.nodeGist,
      ...req.ancestorTitles,
      ...req.priorSummaries,
      ...req.history.map((m) => m.content),
    ].join(' '),
  )
}

function matchTopic(text: string): TopicEntry | undefined {
  let best: { topic: TopicEntry; hits: number } | undefined
  for (const topic of TOPICS) {
    const hits = topic.triggers.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0)
    if (hits > 0 && (!best || hits > best.hits)) best = { topic, hits }
  }
  return best?.topic
}

function questionShape(text: string): keyof typeof GENERIC_REPLIES {
  if (/\bwhy\b|\bhow come\b|\breason\b/i.test(text)) return 'why'
  if (/\bhow (do|does|can|would|to)\b|\bimplement\b|\bwrite\b/i.test(text)) return 'how'
  if (/\bvs\.?\b|versus|difference between|better than|compare|or\s+\w+\?$/i.test(text))
    return 'compare'
  return 'default'
}

function tokenize(text: string): string[] {
  return text.match(/\s+|\S+/g) ?? [text]
}

function titleCase(text: string) {
  return text.replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Collapses a learner question into a short label for a summary bubble. */
function condense(text: string, words = 7) {
  const cleaned = text
    .replace(/^(so|ok|okay|hey|hi|but|and|also|wait)\b[,\s]*/i, '')
    .replace(/[?.!]+$/, '')
    .trim()
  const parts = cleaned.split(/\s+/)
  const short = parts.slice(0, words).join(' ')
  return titleCase(short.charAt(0)) + short.slice(1) + (parts.length > words ? '…' : '')
}

export const mockProvider: AIProvider = {
  id: 'mock',
  label: 'Simulated tutor',

  async stream(req, onToken) {
    // Latency shaped to feel like a real first token, not an instant lookup.
    await sleep(260 + Math.random() * 220)

    const topic = matchTopic(req.userMessage) ?? matchTopic(`${req.nodeTitle} ${req.nodeGist}`)
    let body: string

    if (topic) {
      const priorAssistantTurns = req.history.filter((m) => m.role === 'assistant').length
      body =
        priorAssistantTurns === 0
          ? topic.overview
          : topic.depth[(priorAssistantTurns - 1) % topic.depth.length]!
    } else {
      body = GENERIC_REPLIES[questionShape(req.userMessage)]
    }

    let out = ''
    for (const tok of tokenize(body)) {
      out += tok
      onToken(tok)
      await sleep(tok.trim().length > 8 ? 16 : 9)
    }
    return out
  },

  async summarize(req) {
    await sleep(420)
    const userTurns = req.messages.filter((m) => m.role === 'user')
    const transcript = req.messages.map((m) => m.content).join(' ')
    const topic = matchTopic(transcript) ?? matchTopic(req.nodeTitle)
    const head = userTurns[0]?.content ?? req.nodeTitle

    const title = condense(head, 6)
    const covered = topic ? topic.label : req.nodeTitle
    const openThread = topic?.prompts[userTurns.length % topic.prompts.length]

    const summary = [
      `${userTurns.length} question${userTurns.length === 1 ? '' : 's'} on ${covered}.`,
      userTurns.length > 1
        ? `Started at "${condense(head, 8)}" and worked toward ${condense(
            userTurns[userTurns.length - 1]!.content,
            8,
          )}.`
        : `Focused on ${condense(head, 10)}.`,
      openThread ? `Left open: ${openThread}` : '',
    ]
      .filter(Boolean)
      .join(' ')

    return { title, summary }
  },

  async summarizeCorrection(req) {
    await sleep(520)
    const followUps = Math.max(0, req.messages.filter((m) => m.role === 'user').length - 1)
    const tail = req.messages.filter((m) => m.role === 'user').at(-1)

    const summary = [
      `Believed: ${req.belief}`,
      `Corrected to: ${req.correction.split('. ')[0]}.`,
      followUps > 0 && tail
        ? `Pushed further on “${condense(tail.content, 9)}”.`
        : 'Worked through the counter-example.',
    ].join(' ')

    return { title: `Corrected: ${req.concept}`, summary }
  },

  async analyze(targets, knownRuleKeys) {
    await sleep(900)
    const drafts: MisconceptionDraft[] = []

    for (const target of targets) {
      for (const msg of target.messages) {
        if (msg.role !== 'user') continue
        for (const rule of MISCONCEPTION_RULES) {
          const key = `${rule.id}:${target.nodeId}`
          if (knownRuleKeys.has(key)) continue
          if (drafts.some((d) => d.ruleId === rule.id && d.nodeId === target.nodeId)) continue
          if (!rule.pattern.test(msg.content)) continue
          drafts.push(toDraft(rule, target.nodeId, msg))
        }
      }
    }

    // Highest-severity findings first so the panel leads with what matters.
    return drafts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1))
  },

  suggestedPrompts(nodeTitle) {
    const topic = matchTopic(nodeTitle)
    return (
      topic?.prompts ?? [
        'Explain this from first principles.',
        'What do people usually get wrong here?',
        'Give me a concrete example.',
      ]
    )
  },
}

function toDraft(rule: MisconceptionRule, nodeId: string, msg: Message): MisconceptionDraft {
  const hit = rule.pattern.exec(msg.content)
  const quote = (hit?.[0] ?? msg.content).trim()
  return {
    ruleId: rule.id,
    nodeId,
    concept: rule.concept,
    belief: rule.belief,
    correction: rule.correction,
    severity: rule.severity,
    evidenceMessageId: msg.id,
    evidenceQuote: quote.length > 160 ? `${quote.slice(0, 157)}…` : quote,
    fixTitle: rule.fixTitle,
    drillQuestion: rule.drillQuestion,
    drillAnswer: rule.drillAnswer,
  }
}

export const provider: AIProvider = mockProvider
