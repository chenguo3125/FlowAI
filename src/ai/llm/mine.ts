import { claimIdFor, topicSignature, type Scope } from '@/ai/claims'
import { matchTopic, type MisconceptionRule } from '@/ai/knowledge'
import { chatJson } from '@/ai/llm/client'
import type { Message } from '@/types'

/**
 * Claim mining: the one place the model is allowed to decide *what* a
 * misconception is, rather than whether a learner holds one.
 *
 * It runs at most once per topic, when Tier 1 has nothing to offer because
 * nobody ever wrote claims for that topic. The output is cached in the claim
 * library, so the cost is O(topics) rather than O(topics × analyzer runs) and
 * every later sweep on that topic is local embeddings only.
 *
 * Mining stays strictly separate from adjudication for two reasons. Determinism:
 * a mined claim gets a hash-stable id and is then judged by the same Tier 2 as a
 * curated one, so a gap the learner closed cannot reopen under a reworded name.
 * And reviewability: claims are content, and content you can inspect and edit is
 * worth more than a verdict you cannot.
 */

/** Floor for a turn to count as engagement rather than an acknowledgement. */
const MIN_TURN_CHARS = 24

/** A turn this long counts as substantive even without a question mark. */
const SUBSTANTIVE_TURN_CHARS = 40

/**
 * Mine only when the topic's shelf is this thin.
 *
 * Tier 1 finding nothing means one of two things, and they want opposite
 * responses. If the topic already has claims, it means the learner simply did
 * not express those misconceptions — the correct answer, and mining would be
 * waste. If the topic has almost none, it means the library cannot answer the
 * question at all, which is the case worth paying for.
 */
export const SPARSE_TOPIC_CLAIMS = 3

/** Small on purpose: recall comes from Tier 1, and a long tail dilutes the field. */
const MAX_CLAIMS = 5

const SYSTEM = `You write a misconception library for one topic in a study tool.

Name the misconceptions a learner is most likely to actually hold about this topic — the load-bearing ones that silently produce wrong answers, not trivia. Prefer mistakes about where a rule stops applying, what a guarantee actually covers, and which precondition is doing the real work.

For each misconception:
- concept: the distinction being missed, 2-5 words. Not the topic name.
- belief: the wrong claim, phrased the way a learner would say it out loud, one sentence.
- correction: the accurate framing, 2-3 sentences. State the boundary, not just the rule.
- severity: "high" if believing it produces wrong answers, "medium" if it only produces poor judgement.
- fixTitle: "Fix: <short claim>", at most 6 words.
- drillQuestion: what the learner would ask to have this corrected, in their voice, one sentence.
- drillAnswer: the correction worked through concretely. Markdown. Lead with a specific example or counter-example rather than a definition, name which part of the belief breaks, and give the boundary where the rule does hold. 2-4 short paragraphs.

Do not restate the same misconception twice in different words. Fewer, sharper claims beat a long list.`

interface MinedClaim {
  concept: string
  belief: string
  correction: string
  severity: 'high' | 'medium'
  fixTitle: string
  drillQuestion: string
  drillAnswer: string
}

const SCHEMA = {
  name: 'mined_claims',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['claims'],
    properties: {
      claims: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'concept',
            'belief',
            'correction',
            'severity',
            'fixTitle',
            'drillQuestion',
            'drillAnswer',
          ],
          properties: {
            concept: { type: 'string' },
            belief: { type: 'string' },
            correction: { type: 'string' },
            severity: { type: 'string', enum: ['high', 'medium'] },
            fixTitle: { type: 'string' },
            drillQuestion: { type: 'string' },
            drillAnswer: { type: 'string' },
          },
        },
      },
    },
  },
}

/** In-flight guard: two nodes on the same topic must not both pay for mining. */
const inFlight = new Map<string, Promise<Omit<MisconceptionRule, 'pattern'>[]>>()

export function worthMining(messages: Message[], scope: Scope): boolean {
  const thin = !scope.matched || scope.claims.length < SPARSE_TOPIC_CLAIMS
  if (!thin) return false
  return messages.some((m) => m.role === 'user' && substantive(m.content))
}

/**
 * Total characters is the wrong test: "ok that makes sense, thanks" clears any
 * character floor low enough to admit a single real question, and mining a topic
 * off the back of an acknowledgement is a spend with nothing behind it. A turn
 * counts when it asks something, or when it is long enough to be asserting
 * something.
 */
function substantive(content: string): boolean {
  const text = content.trim()
  if (text.length < MIN_TURN_CHARS) return false
  return text.endsWith('?') || text.length >= SUBSTANTIVE_TURN_CHARS
}

/**
 * Generates claims for one topic. Learner turns are included only to steer which
 * misconceptions are worth naming — never to decide whether this learner holds
 * one, which stays Tier 2's job.
 */
export async function mineClaims(
  nodeTitle: string,
  messages: Message[],
): Promise<Omit<MisconceptionRule, 'pattern'>[]> {
  const signature = topicSignature(nodeTitle)
  const existing = inFlight.get(signature)
  if (existing) return existing

  const run = request(nodeTitle, signature, messages)
  inFlight.set(signature, run)
  try {
    return await run
  } finally {
    inFlight.delete(signature)
  }
}

async function request(
  nodeTitle: string,
  signature: string,
  messages: Message[],
): Promise<Omit<MisconceptionRule, 'pattern'>[]> {
  const asked = messages
    .filter((m) => m.role === 'user')
    .slice(-6)
    .map((m) => `- ${m.content.replace(/\s+/g, ' ').trim()}`)
    .join('\n')

  const result = await chatJson<{ claims?: MinedClaim[] }>(
    [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `Topic: ${nodeTitle}\n\nWhat the learner has been asking about it:\n${asked}\n\nReturn at most ${MAX_CLAIMS} misconceptions for this topic.`,
      },
    ],
    SCHEMA,
    0.3,
  )

  // A known topic keeps its `topicHint` so mined and curated claims share a
  // scope. An unknown one is scoped by signature instead, which is the only
  // handle we have on "the node this came from".
  const topicHint = matchTopic(nodeTitle)?.id

  const seen = new Set<string>()
  const claims: Omit<MisconceptionRule, 'pattern'>[] = []

  for (const raw of result.claims ?? []) {
    if (!raw.belief?.trim() || !raw.drillAnswer?.trim()) continue
    const id = claimIdFor(raw.belief)
    if (seen.has(id)) continue
    seen.add(id)

    claims.push({
      id,
      topicHint,
      topicSignature: topicHint ? undefined : signature,
      origin: 'mined',
      concept: raw.concept.trim(),
      belief: raw.belief.trim(),
      correction: raw.correction.trim(),
      severity: raw.severity === 'high' ? 'high' : 'medium',
      fixTitle: raw.fixTitle.trim(),
      drillQuestion: raw.drillQuestion.trim(),
      drillAnswer: raw.drillAnswer.trim(),
    })
    if (claims.length >= MAX_CLAIMS) break
  }

  return claims
}
