/**
 * Transport to the dev-server proxy in `vite/llmProxy.ts`.
 *
 * No key handling here by design — this module runs in the browser, so anything
 * it touched would be in the bundle. It knows only `/api/llm/chat`. Embeddings
 * are local (see `src/ai/embedder.ts`) and never go through this proxy.
 */

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const CHAT_URL = '/api/llm/chat'

async function post(url: string, body: unknown): Promise<Response> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const detail = await res
      .json()
      .then((j: { error?: string }) => j.error)
      .catch(() => null)
    throw new Error(detail || `Model request failed (${res.status})`)
  }
  return res
}

/**
 * Streams a completion, invoking `onToken` per delta and resolving with the full
 * text. Deltas arrive as SSE frames that can split mid-line across chunks, so the
 * tail of each read is held back until its newline shows up.
 */
export async function chatStream(
  messages: ChatTurn[],
  onToken: (chunk: string) => void,
  temperature = 0.4,
): Promise<string> {
  const res = await post(CHAT_URL, { messages, temperature, stream: true })
  const reader = res.body?.getReader()
  if (!reader) throw new Error('Model response had no body')

  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') continue

      try {
        const parsed = JSON.parse(data) as {
          choices?: { delta?: { content?: string } }[]
        }
        const token = parsed.choices?.[0]?.delta?.content
        if (token) {
          full += token
          onToken(token)
        }
      } catch {
        // A malformed frame mid-stream is not worth failing a whole reply over.
      }
    }
  }

  return full
}

/**
 * One completion constrained to a JSON schema. Used for every non-chat call —
 * summaries and misconception verdicts — because a parse failure on a
 * free-text response is a failure mode this app should simply not have.
 */
export async function chatJson<T>(
  messages: ChatTurn[],
  schema: { name: string; schema: Record<string, unknown> },
  temperature = 0,
): Promise<T> {
  const res = await post(CHAT_URL, {
    messages,
    temperature,
    responseFormat: {
      type: 'json_schema',
      json_schema: { name: schema.name, schema: schema.schema, strict: true },
    },
  })

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const content = json.choices?.[0]?.message?.content
  if (!content) throw new Error('Model returned an empty structured response')

  try {
    return JSON.parse(content) as T
  } catch {
    throw new Error('Model returned unparseable JSON despite a schema constraint')
  }
}
