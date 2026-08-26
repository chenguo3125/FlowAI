/// <reference types="vite/client" />

/**
 * Injected by `define` in vite.config.ts. The client is allowed to know whether
 * a chat provider is configured and which chat model name to show. The API key
 * is deliberately absent — embeddings run on-device and never need it.
 */
declare const __LLM_ENABLED__: boolean
declare const __LLM_CHAT_MODEL__: string

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string
  readonly VITE_FIREBASE_APP_ID?: string
}
