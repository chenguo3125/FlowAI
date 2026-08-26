import type { Message } from '@/types'

/**
 * Everything the model is allowed to see for one node's micro-chat.
 *
 * This shape *is* the context-isolation guarantee. `history` only ever holds the
 * selected node's live thread; closed threads enter as one-line summaries rather
 * than full transcripts; ancestors contribute titles as a breadcrumb and nothing
 * more. Swapping in a real LLM means implementing `AIProvider` against the same
 * boundary — which is exactly what `ai/llm/provider.ts` does.
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
  /**
   * `knownRuleKeys` holds `ruleId:nodeId` for every misconception already on the
   * canvas, resolved or not. Honouring it is what stops a closed gap from being
   * re-detected the moment the learner reopens the topic.
   */
  analyze(targets: AnalyzeTarget[], knownRuleKeys: Set<string>): Promise<MisconceptionDraft[]>
  suggestedPrompts(nodeTitle: string): string[]
}

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
