import {
  allClaims,
  hasMinedTopic,
  saveMinedClaims,
  scopeToTopic,
  topicSignature,
  type Scope,
} from '@/ai/claims'
import { llmEnabled } from '@/ai/config'
import type { AnalyzeTarget, MisconceptionDraft } from '@/ai/contract'
import type { MisconceptionRule } from '@/ai/knowledge'
import { adjudicate } from '@/ai/llm/adjudicate'
import { heuristicConfirm } from '@/ai/llm/heuristic'
import { mineClaims, worthMining } from '@/ai/llm/mine'
import { candidatesFor } from '@/ai/llm/tier1'

/**
 * How many topics one sweep may mine.
 *
 * Without a cap, the first sweep on a full canvas fires a mining call for every
 * thin topic at once — a latency spike and a rate-limit risk on the one action
 * the learner is watching. Since mining is permanent, spreading it across sweeps
 * costs nothing but time: unmined topics are simply picked up next run.
 */
const MAX_MINES_PER_SWEEP = 3

/**
 * The tiered analyzer used by the composed provider.
 *
 *  - Tier 0: drop claims already on the canvas for that node (resolved or not),
 *    then narrow the library to this node's topic.
 *  - Tier 1: local embeddings + regex, on the learner's words only.
 *  - Tier 1½: if Tier 1 found nothing and the topic's shelf is thin, mine claims
 *    for it once, cache them, and run Tier 1 again against them. This is the only
 *    way a topic nobody wrote rules for can ever be analyzed.
 *  - Tier 2: LLM judge when a key is present; heuristic confirm otherwise.
 *
 * Nodes run concurrently. One node failing does not void the rest of the sweep.
 */
export async function analyzeCanvas(
  targets: AnalyzeTarget[],
  knownRuleKeys: Set<string>,
): Promise<MisconceptionDraft[]> {
  const library = await allClaims()
  const budget = { mines: MAX_MINES_PER_SWEEP }

  const runs = targets.map(async (target) => {
    const unknown = (claims: MisconceptionRule[]) =>
      claims.filter((c) => !knownRuleKeys.has(`${c.id}:${target.nodeId}`))

    const scope = scopeToTopic(unknown(library), target.nodeTitle, target.messages)
    let candidates = await candidatesFor(target.messages, scope.claims)

    if (candidates.length === 0) {
      const mined = await mineIfNeeded(target, scope, budget)
      const eligible = unknown(mined)
      if (eligible.length > 0) candidates = await candidatesFor(target.messages, eligible)
    }
    if (candidates.length === 0) return []

    if (llmEnabled) {
      try {
        return await adjudicate(target.nodeId, target.nodeTitle, candidates)
      } catch (err) {
        // A downed chat endpoint should not wipe a sweep that already found
        // regex-grade evidence. Fall through to the heuristic on this node.
        console.warn('[flowai] Tier 2 failed, using heuristic:', err)
      }
    }

    return heuristicConfirm(target.nodeId, candidates)
  })

  const settled = await Promise.allSettled(runs)
  const drafts: MisconceptionDraft[] = []

  for (const result of settled) {
    if (result.status === 'fulfilled') drafts.push(...result.value)
    else console.warn('[flowai] analyzer node failed:', result.reason)
  }

  return drafts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1))
}

/**
 * Mines this node's topic if the library is thin on it, it has never been mined,
 * and the thread is substantial enough to be worth naming misconceptions about.
 *
 * Returns the newly stored claims, or nothing — a failure here is not worth
 * failing the sweep over, since the learner asked for an analysis and the other
 * nodes can still deliver one.
 */
async function mineIfNeeded(
  target: AnalyzeTarget,
  scope: Scope,
  budget: { mines: number },
): Promise<MisconceptionRule[]> {
  if (!llmEnabled) return []
  if (!worthMining(target.messages, scope)) return []

  const signature = topicSignature(target.nodeTitle)
  if (await hasMinedTopic(signature)) return []

  // Check and decrement with no await between them, so concurrent nodes cannot
  // both take the last slot.
  if (budget.mines <= 0) return []
  budget.mines -= 1

  try {
    const mined = await mineClaims(target.nodeTitle, target.messages)
    return await saveMinedClaims(signature, mined)
  } catch (err) {
    console.warn('[flowai] claim mining failed:', err)
    return []
  }
}
