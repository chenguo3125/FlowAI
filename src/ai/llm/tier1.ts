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
 *    belief, which catches the paraphrases a regex never will.
 */

/** Cosine floor for an embedding-only candidate. Deliberately generous. */
const SIMILARITY_FLOOR = 0.38

/** Per-message cap, so a rambling turn cannot flood the next tier. */
const MAX_CLAIMS_PER_MESSAGE = 3

/** Below this, a turn is an acknowledgement, not an assertion worth judging. */
const MIN_CHARS = 24

export interface Candidate {
  rule: MisconceptionRule
  message: Message
  similarity: number
  /** True when a curated regex fired, which the next tier is told about. */
  viaRegex: boolean
}

/** A claim's embeddable form: the concept plus the belief as plainly as possible. */
export const claimText = (rule: MisconceptionRule) =>
  `${rule.concept}. The learner believes: ${rule.belief}`

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

    const scored = eligible.map((rule, i) => ({
      rule,
      similarity: cosine(messageVector, claimVectors[i]!),
      viaRegex: rule.pattern.test(message.content),
    }))

    const picked = scored
      .filter((s) => s.viaRegex || s.similarity >= SIMILARITY_FLOOR)
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
