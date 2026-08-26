import { llmEnabled } from '@/ai/config'
import type { AIProvider, MisconceptionDraft } from '@/ai/contract'
import { analyzeCanvas } from '@/ai/llm/analyze'
import { llmProvider } from '@/ai/llm/provider'
import type { Message } from '@/types'
import {
  GENERIC_REPLIES,
  MISCONCEPTION_RULES,
  matchTopic,
  suggestedPromptsFor,
  type MisconceptionRule,
} from './knowledge'

export type {
  AIProvider,
  AnalyzeTarget,
  ChatRequest,
  CorrectionSummarizeRequest,
  MisconceptionDraft,
  SummarizeRequest,
} from '@/ai/contract'
export { contextTokens, estimateTokens } from '@/ai/contract'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

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

    return drafts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1))
  },

  suggestedPrompts(nodeTitle) {
    return suggestedPromptsFor(nodeTitle)
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

/**
 * Chat and summaries follow the key: simulated tutor until `.env.local` has
 * one, live model after. Analyze is always the local embedding pipeline —
 * MiniLM does not wait on a provider key.
 */
export const provider: AIProvider = {
  ...(llmEnabled ? llmProvider : mockProvider),
  analyze: analyzeCanvas,
}
