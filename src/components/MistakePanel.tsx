import { ArrowLeft, BadgeCheck, CircleDot, Crosshair, Quote, ScanSearch, Wrench } from 'lucide-react'
import { useCallback, useState } from 'react'

import { plural, relativeTime } from '@/lib/text'
import { useCanvas } from '@/store/canvasStore'
import type { Misconception } from '@/types'

export function MistakePanel() {
  const misconceptions = useCanvas((s) => s.misconceptions)
  const lastRun = useCanvas((s) => s.lastRun)
  const selectedNodeId = useCanvas((s) => s.selectedNodeId)
  const analyzing = useCanvas((s) => s.analyzing)
  const runAnalyzer = useCanvas((s) => s.runAnalyzer)
  const exitReview = useCanvas((s) => s.exitReview)
  const selectNode = useCanvas((s) => s.selectNode)
  const nodes = useCanvas((s) => s.nodes)
  const titleOf = useCallback(
    (id: string) => nodes.find((n) => n.id === id)?.data.title ?? 'deleted node',
    [nodes],
  )

  const open = misconceptions.filter((m) => !m.resolved)
  const here = open.filter((m) => m.nodeId === selectedNodeId)
  const elsewhere = open.filter((m) => m.nodeId !== selectedNodeId)
  const resolved = misconceptions.filter((m) => m.resolved)

  if (misconceptions.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-10 text-center">
        <div className="grid size-12 place-items-center rounded-xl bg-ink-850 ring-1 ring-ink-700">
          <ScanSearch className="size-5 text-ink-500" />
        </div>
        <h3 className="text-[14px] font-semibold text-ink-200">Mistake graph is empty</h3>
        <p className="text-[12px] leading-relaxed text-ink-400">
          The analyzer reads every transcript on the canvas, finds beliefs that do not hold up,
          colours the affected nodes, and grows a correction sub-node for each gap.
        </p>
        <button
          onClick={() => exitReview()}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-400 transition hover:text-ink-100"
        >
          <ArrowLeft className="size-3.5" />
          Back to canvas
        </button>
        <button
          disabled={analyzing}
          onClick={() => void runAnalyzer()}
          className="mt-1 inline-flex items-center gap-2 rounded-lg bg-gap/15 px-3 py-2 text-[12px] font-semibold text-gap ring-1 ring-gap/35 transition hover:bg-gap/25 disabled:opacity-50"
        >
          <ScanSearch className="size-3.5" />
          {analyzing ? 'Analyzing…' : 'Run misconception analyzer'}
        </button>
      </div>
    )
  }

  return (
    <div className="scrollbar-slim flex-1 overflow-y-auto px-4 py-4">
      {lastRun && (
        <div className="mb-4 rounded-xl bg-ink-850/60 px-3 py-2.5 ring-1 ring-ink-800">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CircleDot className="size-3 text-accent" />
              <span className="text-[11.5px] font-medium text-ink-200">
                Last sweep {relativeTime(lastRun.ranAt)}
              </span>
            </div>
            <button
              onClick={() => exitReview()}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-ink-400 ring-1 ring-ink-700 transition hover:bg-ink-800 hover:text-ink-100"
            >
              <ArrowLeft className="size-3" />
              Back
            </button>
          </div>
          <p className="mt-1 text-[11px] text-ink-500">
            Read {plural(lastRun.messagesScanned, 'message')} across{' '}
            {plural(lastRun.nodesScanned, 'node')} · {plural(lastRun.found.length, 'gap')} surfaced
          </p>
        </div>
      )}

      {here.length > 0 && (
        <Section label="On this node">
          {here.map((m) => (
            <Card key={m.id} m={m} nodeTitle={titleOf(m.nodeId)} />
          ))}
        </Section>
      )}

      {elsewhere.length > 0 && (
        <Section label="Elsewhere on the canvas">
          {elsewhere.map((m) => (
            <Card key={m.id} m={m} nodeTitle={titleOf(m.nodeId)} showOrigin />
          ))}
        </Section>
      )}

      {resolved.length > 0 && (
        <Section label={`Corrected (${resolved.length})`}>
          {resolved.map((m) => (
            <button
              key={m.id}
              onClick={() => selectNode(m.nodeId)}
              title={`Open ${titleOf(m.nodeId)}, where the drill thread now lives`}
              className="flex w-full items-center gap-2 rounded-lg bg-ink-850/40 px-3 py-2 text-left ring-1 ring-ink-800 transition hover:ring-fix/40"
            >
              <BadgeCheck className="size-3.5 shrink-0 text-solid" />
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-400">
                {m.concept}
              </span>
              <span className="shrink-0 text-[10px] text-ink-600">{titleOf(m.nodeId)}</span>
            </button>
          ))}
        </Section>
      )}

      {open.length === 0 && resolved.length > 0 && (
        <p className="mt-2 rounded-lg bg-solid/8 px-3 py-2.5 text-[11.5px] leading-relaxed text-solid ring-1 ring-solid/25">
          Every detected gap is closed. Re-run the analyzer after your next few threads — new
          transcripts mean new evidence.
        </p>
      )}

      <button
        disabled={analyzing}
        onClick={() => void runAnalyzer()}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink-850 px-3 py-2 text-[12px] font-medium text-ink-300 ring-1 ring-ink-700 transition hover:bg-ink-800 hover:text-ink-100 disabled:opacity-50"
      >
        <ScanSearch className="size-3.5" />
        {analyzing ? 'Analyzing…' : 'Re-run analyzer'}
      </button>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-2 text-[9.5px] font-semibold tracking-wider text-ink-500 uppercase">
        {label}
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  )
}

function Card({
  m,
  nodeTitle,
  showOrigin,
}: {
  m: Misconception
  nodeTitle: string
  showOrigin?: boolean
}) {
  const jumpToEvidence = useCanvas((s) => s.jumpToEvidence)
  const selectNode = useCanvas((s) => s.selectNode)
  const resolveMisconception = useCanvas((s) => s.resolveMisconception)
  // Folding a thread that is still receiving tokens would race the reply.
  const drillStreaming = useCanvas((s) => s.streamDraft?.nodeId === m.correctionNodeId)
  const [closing, setClosing] = useState(false)

  const high = m.severity === 'high'

  return (
    <div
      className={`rounded-xl px-3 py-3 ring-1 ${
        high ? 'bg-gap/6 ring-gap/35' : 'bg-shaky/6 ring-shaky/30'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`rounded px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wider uppercase ring-1 ${
            high ? 'bg-gap/15 text-gap ring-gap/35' : 'bg-shaky/15 text-shaky ring-shaky/35'
          }`}
        >
          {high ? 'high' : 'medium'}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink-200">
          {m.concept}
        </span>
      </div>

      {showOrigin && (
        <button
          onClick={() => selectNode(m.nodeId)}
          className="mt-1.5 text-[10.5px] text-ink-500 underline decoration-ink-600 hover:text-accent"
        >
          from “{nodeTitle}”
        </button>
      )}

      <p className="mt-2 text-[12px] leading-relaxed text-ink-300">
        <span className="font-semibold text-ink-400">You appear to believe: </span>
        {m.belief}
      </p>

      {m.evidenceQuote && (
        <button
          onClick={() => jumpToEvidence(m)}
          className="mt-2 flex w-full items-start gap-1.5 rounded-lg bg-ink-950/50 px-2.5 py-2 text-left ring-1 ring-ink-800 transition hover:ring-accent/45"
          title="Jump to the message this came from"
        >
          <Quote className="mt-0.5 size-3 shrink-0 text-ink-600" />
          <span className="text-[11px] leading-snug text-ink-400 italic">
            “{m.evidenceQuote}”
          </span>
          <Crosshair className="mt-0.5 size-3 shrink-0 text-ink-600" />
        </button>
      )}

      <p className="mt-2.5 rounded-lg bg-ink-950/40 px-2.5 py-2 text-[12px] leading-relaxed text-ink-300 ring-1 ring-ink-800">
        <span className="font-semibold text-solid">Actually: </span>
        {m.correction}
      </p>

      <div className="mt-3 flex items-center gap-2">
        {m.correctionNodeId && (
          <button
            onClick={() => selectNode(m.correctionNodeId!)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-fix/15 px-2.5 py-1.5 text-[11.5px] font-semibold text-fix ring-1 ring-fix/35 transition hover:bg-fix/25"
          >
            <Wrench className="size-3" />
            Open drill node
          </button>
        )}
        <button
          disabled={closing || drillStreaming}
          title={
            drillStreaming
              ? 'Waiting for the drill reply to finish'
              : 'Close this gap and fold the drill thread into the parent topic'
          }
          onClick={async () => {
            setClosing(true)
            try {
              await resolveMisconception(m.id)
            } finally {
              setClosing(false)
            }
          }}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium text-ink-400 ring-1 ring-ink-700 transition hover:bg-ink-850 hover:text-solid disabled:opacity-45"
        >
          <BadgeCheck className="size-3" />
          {closing ? 'Filing…' : "I've got it now"}
        </button>
      </div>
    </div>
  )
}
