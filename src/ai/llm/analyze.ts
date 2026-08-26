import { llmEnabled } from '@/ai/config'
import type { AnalyzeTarget, MisconceptionDraft } from '@/ai/contract'
import { MISCONCEPTION_RULES } from '@/ai/knowledge'
import { adjudicate } from '@/ai/llm/adjudicate'
import { heuristicConfirm } from '@/ai/llm/heuristic'
import { candidatesFor } from '@/ai/llm/tier1'

/**
 * The tiered analyzer used by the composed provider.
 *
 *  - Tier 0: drop claims already on the canvas for that node (resolved or not).
 *  - Tier 1: local embeddings + regex, on the learner's words only.
 *  - Tier 2: LLM judge when a key is present; heuristic confirm otherwise.
 *
 * Nodes run concurrently. One node failing does not void the rest of the sweep.
 */
export async function analyzeCanvas(
  targets: AnalyzeTarget[],
  knownRuleKeys: Set<string>,
): Promise<MisconceptionDraft[]> {
  const runs = targets.map(async (target) => {
    const eligible = MISCONCEPTION_RULES.filter(
      (rule) => !knownRuleKeys.has(`${rule.id}:${target.nodeId}`),
    )
    if (eligible.length === 0) return []

    const candidates = await candidatesFor(target.messages, eligible)
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
