/**
 * FNV-1a, 32-bit. Not cryptographic — its only job is to answer "is this the
 * same text as last time?" for cache keys, where a collision costs one stale
 * embedding rather than anything a learner would notice.
 */
export function hashString(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}
