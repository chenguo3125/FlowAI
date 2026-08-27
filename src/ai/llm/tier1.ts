import { cosine, embedTexts } from '@/ai/embedder'
import type { MisconceptionRule } from '@/ai/knowledge'
import type { Message } from '@/types'

/**
 * Tier 1: cheap, high-recall candidate generation.
 *
 * Runs entirely on-device. Its job is recall, not precision — it should
 * over-offer, because Tier 2 (or the no-key heuristic) is what decides. Two
 * independent signals are unioned:
 *
 *  - the curated regexes in `knowledge.ts`, which are high precision and free,
 *    so a hit is always promoted regardless of what the embeddings think;
 *  - cosine similarity between the learner's sentence and the claim's stated
 *    belief, which catches the paraphrases a regex never will. Mined claims have
 *    no regex at all, so this is their only route through.
 */

/** Absolute cosine floor for an embedding-only candidate. Deliberately generous. */
const SIMILARITY_FLOOR = 0.38

/**
 * How far above the field's median a claim must score.
 *
 * An absolute floor alone does not survive a growing library: take the maximum
 * over enough claims and something always clears 0.38, so every sentence would
 * produce candidates and Tier 2 would pay to reject them. Requiring a margin
 * over the median asks the useful question instead — is this claim a better fit
 * than the rest of the field, or merely the loudest coincidence.
 */
const RELATIVE_MARGIN = 0.08

/** Below this many claims the median is noise, so the margin test is skipped. */
const MIN_FIELD_FOR_MARGIN = 5

/** Per-message cap, so a rambling turn cannot flood the next tier. */
const MAX_CLAIMS_PER_MESSAGE = 3

/** Below this, a turn is an acknowledgement, not an assertion worth judging. */
const MIN_CHARS = 16

/**
 * Absolutes and tag questions. A question carrying one of these is not asking
 * to be taught — it is asking for a wrong belief to be confirmed, which is the
 * signal that used to be thrown away.
 */
const LEADING_MARKERS =
  /\b(always|never|only|all|any|every|must|cannot|can'?t|impossible|guaranteed|right|isn'?t|aren'?t|doesn'?t|don'?t|won'?t|no need)\b/i

export interface Candidate {
  rule: MisconceptionRule
  message: Message
  similarity: number
  /** True when a curated regex fired, which the next tier is told about. */
  viaRegex: boolean
  /**
   * True when the turn states the belief as a leading question rather than a
   * flat assertion. Downgrades the finding to shaky instead of voiding it.
   */
  probing: boolean
}

/** A claim's embeddable form: the concept plus the belief as plainly as possible. */
export const claimText = (rule: MisconceptionRule) =>
  `${rule.concept}. The learner believes: ${rule.belief}`

/** A question that smuggles in an absolute, e.g. "So A* only works on trees?" */
export function isLeadingQuestion(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed.endsWith('?')) return false
  return LEADING_MARKERS.test(trimmed)
}

/**
 * Candidates for one node's transcript, considering only learner turns.
 *
 * Assistant turns are excluded on purpose: the tutor's own text is full of
 * sentences like "a common mistake is to think X", and feeding those in would
 * flag the cure as the disease.
 */
export async function candidatesFor(
  messages: Message[],
  eligible: MisconceptionRule[],
): Promise<Candidate[]> {
  if (eligible.length === 0) return []

  const turns = messages.filter((m) => m.role === 'user' && m.content.trim().length >= MIN_CHARS)
  if (turns.length === 0) return []

  const claimTexts = eligible.map(claimText)
  const vectors = await embedTexts([...claimTexts, ...turns.map((t) => t.content)])
  const claimVectors = vectors.slice(0, claimTexts.length)
  const turnVectors = vectors.slice(claimTexts.length)

  const out: Candidate[] = []

  for (let t = 0; t < turns.length; t++) {
    const message = turns[t]!
    const messageVector = turnVectors[t]
    if (!messageVector) continue

    const probing = isLeadingQuestion(message.content)

    const scored = eligible.map((rule, i) => ({
      rule,
      similarity: cosine(messageVector, claimVectors[i]!),
      viaRegex: rule.pattern?.test(message.content) ?? false,
      probing,
    }))

    const bar = Math.max(SIMILARITY_FLOOR, marginBar(scored.map((s) => s.similarity)))

    const picked = scored
      .filter((s) => s.viaRegex || s.similarity >= bar)
      .sort((a, b) => {
        // A regex hit outranks any similarity score: it is curated evidence that
        // this exact phrasing matters, and it is what the seeded canvas relies on.
        if (a.viaRegex !== b.viaRegex) return a.viaRegex ? -1 : 1
        return b.similarity - a.similarity
      })
      .slice(0, MAX_CLAIMS_PER_MESSAGE)

    for (const s of picked) out.push({ ...s, message })
  }

  return out
}

/** Median + margin, or 0 when the field is too small for a median to mean anything. */
function marginBar(similarities: number[]): number {
  if (similarities.length < MIN_FIELD_FOR_MARGIN) return 0
  const sorted = [...similarities].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  const median =
    sorted.length % 2 === 0 ? ((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!
  return median + RELATIVE_MARGIN
}
