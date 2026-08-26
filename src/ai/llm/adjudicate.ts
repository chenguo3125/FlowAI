import type { MisconceptionDraft } from '@/ai/contract'
import type { MisconceptionRule } from '@/ai/knowledge'
import { chatJson } from '@/ai/llm/client'
import { quoteOccursIn } from '@/ai/llm/heuristic'
import type { Candidate } from '@/ai/llm/tier1'
import { hashString } from '@/lib/hash'
import type { Message } from '@/types'

/**
 * Tier 2: the only tier that costs real money.
 *
 * The model is a judge, not a scanner. It is never asked "what is wrong in this
 * transcript" — an unbounded question with no stable answer — but only "is the
 * learner committed to this specific claim, and which sentence shows it". That is
 * binary, checkable against the transcript, and cheap to cache.
 */

/** Below this the verdict is treated as a maybe, and a maybe opens nothing. */
const CONFIDENCE_FLOOR = 0.7

/** Ceiling on new drill nodes per node per run, so one run cannot bury a topic. */
const MAX_NEW_DRILLS_PER_NODE = 2

const CACHE_KEY = 'flowai.verdicts.v1'

const SYSTEM = `You judge whether a learner holds a specific misconception.

You are given candidate claims and the learner's own sentences. For each claim decide:
- "confirmed": a sentence shows the learner actually believes the claim.
- "absent": no sentence supports it, or the learner states the correct view.
- "uncertain": the sentence is ambiguous, hypothetical, or a question rather than a belief.

Rules that matter more than being helpful:
- A question ("is a BST always log n?") is NOT a confirmed belief. It is uncertain at most.
- A learner correcting themselves mid-thought does not hold the misconception.
- evidenceMessageId MUST be copied exactly from a supplied message id.
- evidenceQuote MUST be copied verbatim from that message, and must be the span that
  shows the belief. Never paraphrase, never quote the tutor.
- Judge only the claims given. Do not invent claims.`

interface Verdict {
  claimId: string
  verdict: 'confirmed' | 'absent' | 'uncertain'
  confidence: number
  evidenceMessageId: string
  evidenceQuote: string
}

const SCHEMA = {
  name: 'misconception_verdicts',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['verdicts'],
    properties: {
      verdicts: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['claimId', 'verdict', 'confidence', 'evidenceMessageId', 'evidenceQuote'],
          properties: {
            claimId: { type: 'string' },
            verdict: { type: 'string', enum: ['confirmed', 'absent', 'uncertain'] },
            confidence: { type: 'number' },
            evidenceMessageId: { type: 'string' },
            evidenceQuote: { type: 'string' },
          },
        },
      },
    },
  },
} as const

type VerdictCache = Record<string, Verdict | null>

function loadCache(): VerdictCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as VerdictCache) : {}
  } catch {
    return {}
  }
}

let cache: VerdictCache | null = null

function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    /* quota — in-memory for this session */
  }
}

/**
 * Keyed on the claim plus the exact sentence judged, so adding a message costs
 * one adjudication rather than re-judging the whole thread.
 */
const cacheKey = (c: Candidate) =>
  `${c.rule.id}:${c.message.id}:${hashString(c.message.content)}`

/**
 * Judges candidates for one node and returns only drafts that survive
 * validation. Drill content itself is never generated — it comes from the
 * curated rule, so the model decides *whether*, never *what*.
 */
export async function adjudicate(
  nodeId: string,
  nodeTitle: string,
  candidates: Candidate[],
): Promise<MisconceptionDraft[]> {
  if (candidates.length === 0) return []
  cache ??= loadCache()

  const fresh = candidates.filter((c) => cache![cacheKey(c)] === undefined)
  if (fresh.length > 0) {
    const verdicts = await requestVerdicts(nodeTitle, fresh)

    for (const candidate of fresh) {
      const match = verdicts.find(
        (v) => v.claimId === candidate.rule.id && v.evidenceMessageId === candidate.message.id,
      )
      cache![cacheKey(candidate)] = match ?? null
    }
    saveCache()
  }

  const confirmed: MisconceptionDraft[] = []
  const seenRules = new Set<string>()

  for (const candidate of candidates) {
    const verdict = cache![cacheKey(candidate)]
    if (!verdict || verdict.verdict !== 'confirmed') continue
    if (verdict.confidence < CONFIDENCE_FLOOR) continue
    if (seenRules.has(candidate.rule.id)) continue

    const quote = validateEvidence(verdict, candidate.message)
    if (!quote) continue

    seenRules.add(candidate.rule.id)
    confirmed.push(toDraft(candidate.rule, nodeId, candidate.message.id, quote))
  }

  return confirmed
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1))
    .slice(0, MAX_NEW_DRILLS_PER_NODE)
}

function validateEvidence(verdict: Verdict, message: Message): string | null {
  const quote = verdict.evidenceQuote.trim()
  if (!quoteOccursIn(quote, message)) return null
  return quote.length > 160 ? `${quote.slice(0, 157)}…` : quote
}

async function requestVerdicts(nodeTitle: string, candidates: Candidate[]): Promise<Verdict[]> {
  // One call per node, not per claim: the transcript is the expensive part of the
  // prompt and it is identical across every claim being judged.
  const messages = dedupeMessages(candidates.map((c) => c.message))

  const claimBlock = uniqueRules(candidates)
    .map((rule) => {
      const viaRegex = candidates.some((c) => c.rule.id === rule.id && c.viaRegex)
      const flag = viaRegex ? ' [curated phrasing matched]' : ''
      return `- claimId: ${rule.id}${flag}\n  belief: ${rule.belief}\n  concept: ${rule.concept}`
    })
    .join('\n')

  const transcript = messages
    .map((m) => `id: ${m.id}\n"${m.content.replace(/\s+/g, ' ').trim()}"`)
    .join('\n\n')

  const result = await chatJson<{ verdicts?: Verdict[] }>(
    [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `Topic: ${nodeTitle}\n\nCandidate claims:\n${claimBlock}\n\nLearner's own messages:\n${transcript}\n\nReturn one verdict per candidate claim.`,
      },
    ],
    SCHEMA as unknown as { name: string; schema: Record<string, unknown> },
  )

  return result.verdicts ?? []
}

function dedupeMessages(messages: Message[]): Message[] {
  const seen = new Map<string, Message>()
  for (const m of messages) if (!seen.has(m.id)) seen.set(m.id, m)
  return [...seen.values()]
}

function uniqueRules(candidates: Candidate[]): MisconceptionRule[] {
  const seen = new Map<string, MisconceptionRule>()
  for (const c of candidates) if (!seen.has(c.rule.id)) seen.set(c.rule.id, c.rule)
  return [...seen.values()]
}

function toDraft(
  rule: MisconceptionRule,
  nodeId: string,
  evidenceMessageId: string,
  evidenceQuote: string,
): MisconceptionDraft {
  return {
    ruleId: rule.id,
    nodeId,
    concept: rule.concept,
    belief: rule.belief,
    correction: rule.correction,
    severity: rule.severity,
    evidenceMessageId,
    evidenceQuote,
    fixTitle: rule.fixTitle,
    drillQuestion: rule.drillQuestion,
    drillAnswer: rule.drillAnswer,
  }
}
