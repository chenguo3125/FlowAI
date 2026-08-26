import { useReactFlow } from '@xyflow/react'
import { ArrowLeft, Monitor, Moon, Plus, RotateCcw, ScanSearch, Sun, Workflow } from 'lucide-react'
import { useMemo, useState } from 'react'

import { provider } from '@/ai/provider'
import { firebaseEnabled } from '@/data/firebase'
import { plural } from '@/lib/text'
import { useCanvas } from '@/store/canvasStore'
import { useTheme, type ThemePref } from '@/store/themeStore'

export function TopBar() {
  const nodes = useCanvas((s) => s.nodes)
  const misconceptions = useCanvas((s) => s.misconceptions)
  const analyzing = useCanvas((s) => s.analyzing)
  const reviewMode = useCanvas((s) => s.reviewMode)
  const lastRun = useCanvas((s) => s.lastRun)
  const runAnalyzer = useCanvas((s) => s.runAnalyzer)
  const enterReview = useCanvas((s) => s.enterReview)
  const exitReview = useCanvas((s) => s.exitReview)
  const addNode = useCanvas((s) => s.addNode)
  const resetCanvas = useCanvas((s) => s.resetCanvas)

  const { screenToFlowPosition, fitView } = useReactFlow()
  const [toast, setToast] = useState<string | null>(null)

  const stats = useMemo(() => {
    let threads = 0
    let messages = 0
    for (const n of nodes) {
      threads += n.data.sessions.length + (n.data.active.messages.length > 0 ? 1 : 0)
      messages +=
        n.data.active.messages.length + n.data.sessions.reduce((a, s) => a + s.messages.length, 0)
    }
    return { threads, messages }
  }, [nodes])

  const openGaps = misconceptions.filter((m) => !m.resolved).length

  const analyze = async () => {
    const found = await runAnalyzer()
    setToast(
      found === 0
        ? 'No new misconceptions found in the current transcripts.'
        : `${plural(found, 'gap')} surfaced · ${plural(found, 'correction node')} generated`,
    )
    setTimeout(() => setToast(null), 5200)
  }

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-4 border-b border-ink-800 bg-ink-900 px-4">
      <div className="flex items-center gap-2.5">
        <div className="grid size-8 place-items-center rounded-lg bg-accent/12 ring-1 ring-accent/30">
          <Workflow className="size-4 text-accent" />
        </div>
        <div>
          <div className="text-[13.5px] leading-tight font-semibold text-ink-100">FlowAI</div>
          <div className="text-[10.5px] leading-tight text-ink-500">
            {firebaseEnabled() ? 'Canvas syncs to Firestore' : 'Canvas saved in this browser'}
          </div>
        </div>
      </div>

      <div className="ml-2 hidden items-center gap-3 border-l border-ink-800 pl-4 text-[11.5px] text-ink-500 lg:flex">
        <Stat value={nodes.length} label="nodes" />
        <Stat value={stats.threads} label="threads" />
        <Stat value={stats.messages} label="messages" />
        <Stat value={openGaps} label="open gaps" tone={openGaps > 0 ? 'text-gap' : undefined} />
      </div>

      {toast && (
        <div className="animate-rise ml-auto rounded-lg bg-ink-850 px-3 py-1.5 text-[11.5px] text-ink-300 ring-1 ring-ink-700">
          {toast}
        </div>
      )}

      <div className={`flex items-center gap-2 ${toast ? '' : 'ml-auto'}`}>
        <span
          className="hidden max-w-[11rem] truncate text-[11px] text-ink-500 sm:inline"
          title={provider.label}
        >
          {provider.label}
        </span>

        <ThemeSwitch />

        <button
          onClick={() => {
            const center = screenToFlowPosition({
              x: window.innerWidth / 2 - 220,
              y: window.innerHeight / 2,
            })
            addNode(center)
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-ink-850 px-3 py-1.5 text-[12px] font-medium text-ink-200 ring-1 ring-ink-700 transition hover:bg-ink-800 hover:text-ink-100"
        >
          <Plus className="size-3.5" />
          New node
        </button>

        {reviewMode ? (
          <button
            onClick={() => exitReview()}
            className="inline-flex items-center gap-2 rounded-lg bg-ink-850 px-3 py-1.5 text-[12px] font-semibold text-ink-100 ring-1 ring-ink-600 transition hover:bg-ink-800"
            title="Hide fix nodes and status colours; findings stay saved"
          >
            <ArrowLeft className="size-3.5" />
            Back to canvas
          </button>
        ) : lastRun ? (
          <button
            onClick={() => enterReview()}
            className="inline-flex items-center gap-2 rounded-lg bg-gap/15 px-3 py-1.5 text-[12px] font-semibold text-gap ring-1 ring-gap/35 transition hover:bg-gap/25"
            title="Show detected gaps, status colours, and generated fix nodes"
          >
            <ScanSearch className="size-3.5" />
            Review gaps
          </button>
        ) : null}

        <button
          onClick={() => void analyze()}
          disabled={analyzing}
          className="inline-flex items-center gap-2 rounded-lg bg-gap/15 px-3 py-1.5 text-[12px] font-semibold text-gap ring-1 ring-gap/35 transition hover:bg-gap/25 disabled:opacity-60"
          title="Sweep every transcript on the canvas for cognitive gaps"
        >
          <ScanSearch className={`size-3.5 ${analyzing ? 'animate-spin' : ''}`} />
          {analyzing ? 'Analyzing canvas…' : reviewMode || lastRun ? 'Re-run analyzer' : 'Run misconception analyzer'}
        </button>

        <button
          onClick={() => {
            const ok = window.confirm(
              'Reset the canvas to the original demo? This discards your nodes, chats, and threads in this browser and in Firestore.',
            )
            if (!ok) return
            resetCanvas()
            setTimeout(() => fitView({ padding: 0.22, maxZoom: 0.85 }), 40)
          }}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] text-ink-500 ring-1 ring-ink-800 transition hover:bg-ink-850 hover:text-ink-200"
          title="Discard this canvas and restore the seeded demo"
        >
          <RotateCcw className="size-3.5" />
          Reset demo
        </button>
      </div>
    </header>
  )
}

const THEME_OPTIONS: { pref: ThemePref; icon: typeof Sun; label: string }[] = [
  { pref: 'light', icon: Sun, label: 'Light' },
  { pref: 'system', icon: Monitor, label: 'Match system' },
  { pref: 'dark', icon: Moon, label: 'Dark' },
]

function ThemeSwitch() {
  const pref = useTheme((s) => s.pref)
  const theme = useTheme((s) => s.theme)
  const setPref = useTheme((s) => s.setPref)

  return (
    <div
      className="flex items-center gap-0.5 rounded-lg bg-ink-850 p-0.5 ring-1 ring-ink-700"
      role="radiogroup"
      aria-label="Colour theme"
    >
      {THEME_OPTIONS.map(({ pref: option, icon: Icon, label }) => {
        const active = pref === option
        return (
          <button
            key={option}
            role="radio"
            aria-checked={active}
            onClick={() => setPref(option)}
            title={option === 'system' ? `Match system (currently ${theme})` : label}
            className={`grid size-7 place-items-center rounded-md transition ${
              active
                ? 'bg-ink-700 text-ink-100 shadow-sm'
                : 'text-ink-500 hover:bg-ink-800 hover:text-ink-200'
            }`}
          >
            <Icon className="size-3.5" />
          </button>
        )
      })}
    </div>
  )
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className={`text-[13px] font-semibold ${tone ?? 'text-ink-200'}`}>{value}</span>
      <span>{label}</span>
    </span>
  )
}
