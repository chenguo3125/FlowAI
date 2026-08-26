/**
 * The build-time flags injected by `define` in vite.config.ts.
 *
 * Reads are guarded because these globals exist only under Vite, and the module
 * graph is entered from outside it: `scripts/check-analyzer.ts` imports the
 * provider directly under tsx, where a bare read throws a ReferenceError and
 * takes the whole script down before it can assert anything.
 */
function injected<T>(read: () => T, fallback: T): T {
  try {
    return read()
  } catch {
    return fallback
  }
}

/** True only when `.env.local` supplies a key. Selects live chat/summaries. */
export const llmEnabled = injected(() => __LLM_ENABLED__, false)

export const chatModel = injected(() => __LLM_CHAT_MODEL__, 'unconfigured')
