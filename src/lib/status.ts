import type { MasteryStatus } from '@/types'

export const STATUS_META: Record<
  MasteryStatus,
  { label: string; dot: string; ring: string; glow: string; text: string; chip: string }
> = {
  unexplored: {
    label: 'Not started',
    dot: 'bg-ink-500',
    ring: 'ring-ink-700',
    glow: 'glow-flat',
    text: 'text-ink-400',
    chip: 'bg-ink-800 text-ink-400 ring-ink-700',
  },
  solid: {
    label: 'Looks solid',
    dot: 'bg-solid',
    ring: 'ring-solid/35',
    glow: 'glow-solid',
    text: 'text-solid',
    chip: 'bg-solid/10 text-solid ring-solid/30',
  },
  shaky: {
    label: 'Shaky',
    dot: 'bg-shaky',
    ring: 'ring-shaky/55',
    glow: 'glow-shaky',
    text: 'text-shaky',
    chip: 'bg-shaky/10 text-shaky ring-shaky/30',
  },
  gap: {
    label: 'Knowledge gap',
    dot: 'bg-gap',
    ring: 'ring-gap/65',
    glow: 'glow-gap',
    text: 'text-gap',
    chip: 'bg-gap/12 text-gap ring-gap/35',
  },
}
