import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

/**
 * Dev-server proxy for the chat API.
 *
 * FlowAI is a static client app, so a browser cannot hold an API key. The key
 * lives here — in the Vite dev server's Node process — and the client talks to
 * `/api/llm/chat` instead of talking to the provider directly.
 *
 * Embeddings do not go through this proxy. Tier 1 runs MiniLM on-device.
 *
 * This is dev-only middleware. A production deploy needs the same handler
 * behind a real serverless function, which is why the request/response shape
 * below is deliberately boring and portable.
 */
export interface LlmProxyOptions {
  apiKey: string
  baseUrl: string
  chatModel: string
}

const CHAT_ROUTE = '/api/llm/chat'

export function llmProxy(options: LlmProxyOptions): Plugin {
  const { apiKey, baseUrl, chatModel } = options

  return {
    name: 'flowai:llm-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0]
        if (url !== CHAT_ROUTE) return next()

        if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
        if (!apiKey) {
          return send(res, 503, {
            error: 'No FLOWAI_API_KEY configured. Copy .env.example to .env.local and set it.',
          })
        }

        try {
          const body = await readJson(req)
          return await proxyChat(res, body)
        } catch (err) {
          send(res, 502, { error: err instanceof Error ? err.message : 'Proxy failure' })
        }
      })
    },
  }

  async function upstream(path: string, payload: unknown) {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const detail = await response.text()
      throw new Error(`${response.status} from model API: ${truncate(detail)}`)
    }
    return response
  }

  async function proxyChat(res: ServerResponse, body: Record<string, unknown>) {
    const payload: Record<string, unknown> = {
      model: chatModel,
      messages: body.messages,
      temperature: body.temperature ?? 0.4,
    }
    if (body.responseFormat) payload.response_format = body.responseFormat

    if (!body.stream) {
      const response = await upstream('/chat/completions', payload)
      return send(res, 200, await response.json())
    }

    const response = await upstream('/chat/completions', { ...payload, stream: true })
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })

    const reader = response.body?.getReader()
    if (!reader) return res.end()

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(value)
    }
    res.end()
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 4_000_000) reject(new Error('Request body too large'))
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(new Error('Malformed JSON body'))
      }
    })
    req.on('error', reject)
  })
}

const truncate = (text: string) => (text.length > 400 ? `${text.slice(0, 397)}…` : text)
