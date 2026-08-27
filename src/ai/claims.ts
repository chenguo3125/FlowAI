import { MISCONCEPTION_RULES, matchTopics, type MisconceptionRule } from '@/ai/knowledge'
import { hashString } from '@/lib/hash'
import { idbGet, idbSet } from '@/lib/idb'
import type { Message } from '@/types'

/**
 * The claim library: what the analyzer is capable of detecting at all.
 *
 * Tier 1 can only ever nominate a claim that exists here, which is why a topic
 * nobody wrote rules for — A* search, say — was invisible no matter how the
 * thresholds were tuned. The library is therefore two layers:
 *
 *  - curated claims from `knowledge.ts`, which carry regexes and ship with the app;
 *  - mined claims generated once per new topic and persisted, which carry none.
 *
 * Mining once and caching is what keeps the tiered design affordable: the cost is
 * O(topics) rather than O(topics × analyzer runs), and every later sweep on that
 * topic runs entirely on-device.
 *
 * Ids are a hash of the belief text, not a counter or a uuid. That is load-bearing:
 * the store dedupes gaps by `claimId`, so a re-mined topic has to produce the *same*
 * id for the same belief or a gap the learner already closed would reopen under a
 * new name.
 */

const CLAIMS_KEY = 'flowai.claims.v1'

/** Mined claims only; curated ones come from the bundle, so they are never stored. */
interface ClaimStore {
  claims: StoredClaim[]
  /** Topic signatures already mined, so a barren topic is not mined every sweep. */
  minedTopics: Record<string, number>
}

/** A mined claim as persisted. No `pattern` — RegExp does not survive JSON. */
type StoredClaim = Omit<MisconceptionRule, 'pattern'>

const EMPTY: ClaimStore = { claims: [], minedTopics: {} }

let store: ClaimStore | null = null
let loading: Promise<ClaimStore> | null = null

async function load(): Promise<ClaimStore> {
  if (store) return store
  loading ??= idbGet<ClaimStore>(CLAIMS_KEY).then((hit) => {
    store = hit?.claims ? { claims: hit.claims, minedTopics: hit.minedTopics ?? {} } : { ...EMPTY }
    return store
  })
  try {
    return await loading
  } finally {
    loading = null
  }
}

async function persist() {
  if (!store) return
  try {
    await idbSet(CLAIMS_KEY, store)
  } catch {
    // Quota or private mode. The in-memory library still serves this session;
    // the cost of losing it is re-mining a topic, not losing learner work.
  }
}

/** Stable id for a mined claim, derived from the belief it encodes. */
export const claimIdFor = (belief: string) =>
  `mined-${hashString(belief.toLowerCase().replace(/\s+/g, ' ').trim())}`

/**
 * Canonical name for "the topic this node is about", used to remember what has
 * been mined. Deliberately the node title alone: the gist gets edited, and a
 * re-worded gist should not trigger a second round of mining.
 */
export const topicSignature = (nodeTitle: string) =>
  nodeTitle.toLowerCase().replace(/[^a-z0-9+*]+/g, ' ').trim()

export async function allClaims(): Promise<MisconceptionRule[]> {
  const { claims } = await load()
  return [
    ...MISCONCEPTION_RULES.map((r) => ({ ...r, origin: 'curated' as const })),
    ...claims.map((c) => ({ ...c, origin: 'mined' as const })),
  ]
}

export async function hasMinedTopic(signature: string): Promise<boolean> {
  const { minedTopics } = await load()
  return signature in minedTopics
}

/**
 * Records mined claims, skipping any whose belief already has an id — re-mining
 * a topic is then idempotent rather than additive. The signature is marked even
 * when nothing new lands, so a topic with no misconceptions worth naming is not
 * re-mined on every sweep.
 */
export async function saveMinedClaims(
  signature: string,
  mined: StoredClaim[],
): Promise<MisconceptionRule[]> {
  const current = await load()
  const known = new Set(current.claims.map((c) => c.id))
  const fresh = mined.filter((c) => !known.has(c.id))

  store = {
    claims: [...current.claims, ...fresh],
    minedTopics: { ...current.minedTopics, [signature]: Date.now() },
  }
  await persist()

  return fresh.map((c) => ({ ...c, origin: 'mined' as const }))
}

/**
 * Narrows the library to claims worth comparing against this node.
 *
 * This is what keeps the design sustainable. Tier 1 embeds every eligible claim
 * against every learner turn, and more importantly the chance of a coincidental
 * cosine hit rises with the size of the field — so the pool has to stay small
 * however large the library grows. Two routes put a claim in scope:
 *
 *  - `topicHint` matches a topic recognised in the node title or any learner turn.
 *    Turns are included because threads drift, and a question about pivots should
 *    reach a sorting claim wherever it was asked.
 *  - `topicSignature` matches this node's own title, which is how mined claims for
 *    a topic the topic table has never heard of find their way back.
 *
 * When neither route matches anything, the whole library is in scope. That is the
 * first sweep on an unrecognised topic — there is nothing to narrow *to* yet, and
 * it is precisely the case that ends in mining.
 */
export interface Scope {
  claims: MisconceptionRule[]
  /**
   * False when nothing in the library belongs to this topic and `claims` is the
   * unfiltered fallback. The distinction matters downstream: "no candidates from
   * the topic's own claims" and "no candidates because the topic has no claims"
   * deserve opposite responses, and only the second is worth mining for.
   */
  matched: boolean
}

export function scopeToTopic(
  claims: MisconceptionRule[],
  nodeTitle: string,
  messages: Message[],
): Scope {
  const topics = new Set<string>()
  const noteTopics = (text: string) => {
    for (const topic of matchTopics(text)) topics.add(topic.id)
  }

  noteTopics(nodeTitle)
  for (const m of messages) if (m.role === 'user') noteTopics(m.content)

  const signature = topicSignature(nodeTitle)
  const scoped = claims.filter((c) => {
    if (c.topicSignature) return c.topicSignature === signature
    if (c.topicHint) return topics.has(c.topicHint)
    return true
  })

  return scoped.length > 0 ? { claims: scoped, matched: true } : { claims, matched: false }
}

/** Test seam: drops the in-memory library so a probe run starts clean. */
export function resetClaimsForTest() {
  store = { ...EMPTY }
}
