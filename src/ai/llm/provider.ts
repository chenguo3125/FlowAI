import type {
  AIProvider,
  ChatRequest,
  CorrectionSummarizeRequest,
  SummarizeRequest,
} from '@/ai/contract'
import { chatModel } from '@/ai/config'
import { suggestedPromptsFor } from '@/ai/knowledge'
import { analyzeCanvas } from '@/ai/llm/analyze'
import { chatJson, chatStream, type ChatTurn } from '@/ai/llm/client'
import type { Message } from '@/types'

/**
 * Live chat + summaries. Analyze is the shared tiered pipeline, used whether
 * or not a key is present — embeddings do not wait on the API.
 */

const TUTOR_SYSTEM = `You are a tutor inside FlowAI, a canvas where each topic node holds its own isolated chat.

You can see only this node's context. That is deliberate — do not apologise for it, and do not ask the learner to repeat things you were not given.

How to answer:
- Lead with the claim, then justify it. No preamble.
- Markdown, tight prose. Bold only for the term being defined.
- Correct a wrong premise immediately and say which part broke.
- State the boundary of a rule, not just the rule: when it holds, when it stops holding.
- Prefer one concrete example over three abstract sentences.
- Do not close with an offer to explain more.`

const SUMMARY_SCHEMA = {
  name: 'thread_summary',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'summary'],
    properties: {
      title: { type: 'string' },
      summary: { type: 'string' },
    },
  },
}

/** The stable half of a request: everything that is not this turn's words. */
function contextPreamble(req: ChatRequest): string {
  const parts = [`Topic: ${req.nodeTitle}`, `Scope: ${req.nodeGist}`]

  if (req.ancestorTitles.length > 0) {
    parts.push(`Sits under: ${req.ancestorTitles.join(' › ')}`)
  }
  if (req.priorSummaries.length > 0) {
    parts.push(
      `Already covered in closed threads on this node:\n${req.priorSummaries
        .map((s) => `- ${s}`)
        .join('\n')}`,
    )
  }
  return parts.join('\n')
}

function transcriptOf(messages: Message[]): ChatTurn[] {
  return messages.map((m) => ({ role: m.role, content: m.content }))
}

export const llmProvider: AIProvider = {
  id: 'llm',
  label: `Live model · ${chatModel}`,

  stream(req: ChatRequest, onToken) {
    return chatStream(
      [
        { role: 'system', content: TUTOR_SYSTEM },
        { role: 'system', content: contextPreamble(req) },
        ...transcriptOf(req.history),
        { role: 'user', content: req.userMessage },
      ],
      onToken,
    )
  },

  async summarize(req: SummarizeRequest) {
    const transcript = req.messages
      .map((m) => `${m.role === 'user' ? 'Learner' : 'Tutor'}: ${m.content}`)
      .join('\n\n')

    return chatJson<{ title: string; summary: string }>(
      [
        {
          role: 'system',
          content: `Summarise a finished tutoring thread so it can stand in for the full transcript later.

title: at most 6 words, the question the learner was actually chasing. No trailing punctuation.
summary: 2-3 sentences. What they asked, what landed, and anything left unresolved. Write it for the learner revisiting this in a month, not as meeting minutes.`,
        },
        { role: 'user', content: `Topic: ${req.nodeTitle}\n\n${transcript}` },
      ],
      SUMMARY_SCHEMA,
    )
  },

  async summarizeCorrection(req: CorrectionSummarizeRequest) {
    const transcript = req.messages
      .map((m) => `${m.role === 'user' ? 'Learner' : 'Tutor'}: ${m.content}`)
      .join('\n\n')

    return chatJson<{ title: string; summary: string }>(
      [
        {
          role: 'system',
          content: `Summarise a thread where a learner's misconception was corrected. The durable artifact is the belief that was wrong and what replaced it — that is what they need at revision time.

title: "Corrected: <concept>", at most 6 words total.
summary: 2-3 sentences naming the wrong belief, the correction that landed, and how far they pushed on it.`,
        },
        {
          role: 'user',
          content: `Concept: ${req.concept}\nBelieved: ${req.belief}\nCorrect view: ${req.correction}\n\n${transcript}`,
        },
      ],
      SUMMARY_SCHEMA,
    )
  },

  analyze: analyzeCanvas,

  suggestedPrompts(nodeTitle: string) {
    return suggestedPromptsFor(nodeTitle)
  },
}
