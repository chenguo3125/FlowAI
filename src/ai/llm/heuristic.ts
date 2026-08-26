import type { MisconceptionDraft } from '@/ai/contract'
import { currentBackend } from '@/ai/embedder'
import type { Candidate } from '@/ai/llm/tier1'
import type { Message } from '@/types'

/**
 * Stand-in for Tier 2 when no API key is configured.
 *
 * Regex hits are treated as confirmed — they are curated, high-precision, and
 * what the seeded demo depends on. Embedding-only hits are confirmed only on
 * MiniLM and only above a strict cosine: hashed n-grams confuse shared words
 * like "always" and "n log n" across unrelated claims, so they never
 * auto-confirm without a judge.
 */

/** MiniLM-only floor for an embedding-only confirm. N-grams skip this path. */
export const HEURISTIC_CONFIRM_FLOOR = 0.58

/** Ceiling on new drill nodes per node per run. */
const MAX_NEW_DRILLS_PER_NODE = 2

export function heuristicConfirm(nodeId: string, candidates: Candidate[]): MisconceptionDraft[] {
  const seen = new Set<string>()
  const out: MisconceptionDraft[] = []
  const allowEmbed =
    currentBackend() === 'minilm' ? HEURISTIC_CONFIRM_FLOOR : Number.POSITIVE_INFINITY

  const ranked = [...candidates].sort((a, b) => {
    if (a.viaRegex !== b.viaRegex) return a.viaRegex ? -1 : 1
    if (a.rule.severity !== b.rule.severity) return a.rule.severity === 'high' ? -1 : 1
    return b.similarity - a.similarity
  })

  for (const candidate of ranked) {
    if (seen.has(candidate.rule.id)) continue
    if (!candidate.viaRegex && candidate.similarity < allowEmbed) continue

    const quote = quoteFrom(candidate)
    if (!quote) continue

    seen.add(candidate.rule.id)
    out.push(toDraft(nodeId, candidate, quote))
    if (out.length >= MAX_NEW_DRILLS_PER_NODE) break
  }

  return out
}

function quoteFrom(candidate: Candidate): string | null {
  const message = candidate.message
  if (candidate.viaRegex) {
    const hit = candidate.rule.pattern.exec(message.content)
    const span = (hit?.[0] ?? message.content).trim()
    return clip(span)
  }
  return clip(message.content)
}

function clip(text: string): string | null {
  const quote = text.replace(/\s+/g, ' ').trim()
  if (quote.length < 8) return null
  return quote.length > 160 ? `${quote.slice(0, 157)}…` : quote
}

function toDraft(nodeId: string, candidate: Candidate, evidenceQuote: string): MisconceptionDraft {
  const { rule, message } = candidate
  return {
    ruleId: rule.id,
    nodeId,
    concept: rule.concept,
    belief: rule.belief,
    correction: rule.correction,
    severity: rule.severity,
    evidenceMessageId: message.id,
    evidenceQuote,
    fixTitle: rule.fixTitle,
    drillQuestion: rule.drillQuestion,
    drillAnswer: rule.drillAnswer,
  }
}

/** Loose match so trivial whitespace or case drift does not void real evidence. */
export const normalizeQuote = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim()

export function quoteOccursIn(quote: string, message: Message): boolean {
  const q = normalizeQuote(quote)
  if (q.length < 8) return false
  return normalizeQuote(message.content).includes(q)
}
