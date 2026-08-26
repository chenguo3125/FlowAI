import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

import { llmProxy } from './vite/llmProxy.ts'

export default defineConfig(({ mode }) => {
  // Empty prefix so unprefixed FLOWAI_* vars load. This runs in Node, and only
  // the non-secret values below are forwarded to `define` — the key itself
  // never reaches the client bundle.
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = env.FLOWAI_API_KEY ?? ''

  return {
    plugins: [
      react(),
      tailwindcss(),
      llmProxy({
        apiKey,
        baseUrl: env.FLOWAI_BASE_URL || 'https://api.openai.com/v1',
        chatModel: env.FLOWAI_CHAT_MODEL || 'gpt-4o-mini',
      }),
    ],
    define: {
      __LLM_ENABLED__: JSON.stringify(Boolean(apiKey)),
      __LLM_CHAT_MODEL__: JSON.stringify(env.FLOWAI_CHAT_MODEL || 'gpt-4o-mini'),
    },
    optimizeDeps: {
      exclude: ['@huggingface/transformers'],
    },
    server: {
      watch: {
        // FSEvents does not propagate to Vite in this environment, so the module
        // graph never invalidates and edits silently serve stale. Polling costs a
        // little CPU and makes HMR actually fire.
        usePolling: true,
        interval: 300,
      },
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
