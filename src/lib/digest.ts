import type { Message } from '@/types'
import { plural } from './text'

/**
 * Deterministic thread digests.
 *
 * These exist so that archiving a thread never depends on a network call. State
 * moves synchronously using one of these, and a model-written summary later
 * replaces it if the call succeeds. Nothing here can throw or await, which is
 * the whole point — a failed provider must degrade the prose, not lose the
 * conversation.
 */

function condense(text: string, words = 8) {
  const cleaned = text
    .replace(/^(so|ok|okay|hey|hi|but|and|also|wait)\b[,\s]*/i, '')
    .replace(/[?.!]+$/, '')
    .trim()
  const parts = cleaned.split(/\s+/)
  const short = parts.slice(0, words).join(' ')
  return short + (parts.length > words ? '…' : '')
}

export interface Digest {
  title: string
  summary: string
}

export function threadDigest(nodeTitle: string, messages: Message[]): Digest {
  const asked = messages.filter((m) => m.role === 'user')
  const head = asked[0]?.content ?? nodeTitle
  return {
    title: condense(head, 6) || nodeTitle,
    summary: `${plural(asked.length, 'question')} on ${nodeTitle}. Opened with “${condense(head)}”.`,
  }
}

export function correctionDigest(concept: string, messages: Message[]): Digest {
  const asked = messages.filter((m) => m.role === 'user')
  const followUps = Math.max(0, asked.length - 1)
  return {
    title: `Corrected: ${concept}`,
    summary:
      followUps > 0
        ? `Drill on ${concept.toLowerCase()}, plus ${plural(followUps, 'follow-up')}.`
        : `Drill on ${concept.toLowerCase()}.`,
  }
}
