/** Flattens markdown to plain text for glanceable canvas previews. */
export function stripMd(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, ' [code] ')
    .replace(/\|/g, ' ')
    .replace(/^[-*+]\s+/gm, '• ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*|__|\*|_|`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

export function relativeTime(ts: number) {
  const mins = Math.round((Date.now() - ts) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : `${days}d ago`
}

export function plural(n: number, word: string, suffix = 's') {
  return `${n} ${word}${n === 1 ? '' : suffix}`
}
