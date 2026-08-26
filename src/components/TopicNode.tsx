import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  ChevronRight,
  Layers,
  MessageSquare,
  Radio,
  Sparkles,
  Trash2,
  TriangleAlert,
  Wrench,
} from 'lucide-react'
import { memo } from 'react'

import { NODE_WIDTH, useCanvas, type FlowNode } from '@/store/canvasStore'
import { STATUS_META } from '@/lib/status'
import { plural, relativeTime, stripMd, truncate } from '@/lib/text'
import type { Session } from '@/types'

/**
 * A topic card on the canvas.
 *
 * Closed micro-chats render as accordion summary bubbles here rather than as
 * scrollback — the whole point being that re-access is one click on the canvas
 * instead of a scroll through a linear thread.
 */
export const TopicNode = memo(function TopicNode({ id, data, selected }: NodeProps<FlowNode>) {
  const toggleSessionExpanded = useCanvas((s) => s.toggleSessionExpanded)
  const selectNode = useCanvas((s) => s.selectNode)
  const deleteNode = useCanvas((s) => s.deleteNode)
  const setSidebarTab = useCanvas((s) => s.setSidebarTab)
  const streaming = useCanvas((s) => s.streamDraft?.nodeId === id)
  const openCount = useCanvas(
    (s) => s.misconceptions.filter((m) => m.nodeId === id && !m.resolved).length,
  )

  const meta = STATUS_META[data.status]
  const isFix = data.kind === 'correction'
  const liveTurns = data.active.messages.length
  const archivedTurns = data.sessions.reduce((n, s) => n + s.messages.length, 0)

  return (
    <div
      style={{ width: NODE_WIDTH }}
      className={[
        'group rounded-2xl bg-ink-850/95 backdrop-blur-sm ring-1 transition-all duration-200',
        isFix ? 'ring-fix/50' : meta.ring,
        meta.glow,
        selected ? 'ring-2 ring-accent' : '',
        data.status === 'gap' && !selected ? 'animate-alert' : '',
      ].join(' ')}
    >
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Left} id="l" />
      <Handle type="source" position={Position.Right} id="r" />

      <header className="flex items-start gap-2.5 px-3.5 pt-3.5 pb-2">
        <span
          className={`mt-1.5 size-2 shrink-0 rounded-full ${isFix ? 'bg-fix' : meta.dot}`}
          title={meta.label}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {isFix && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded bg-fix/15 px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wider text-fix uppercase ring-1 ring-fix/30">
                <Wrench className="size-2.5" />
                Fix
              </span>
            )}
            <h3 className="truncate text-[13.5px] font-semibold text-ink-200">{data.title}</h3>
          </div>
          <p className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-ink-400">
            {truncate(stripMd(data.gist), 130)}
          </p>
        </div>
        <button
          className="nodrag mt-0.5 shrink-0 rounded p-1 text-ink-600 opacity-0 transition hover:bg-ink-800 hover:text-gap group-hover:opacity-100"
          title="Delete node"
          onClick={(e) => {
            e.stopPropagation()
            deleteNode(id)
          }}
        >
          <Trash2 className="size-3.5" />
        </button>
      </header>

      {data.sessions.length > 0 && (
        <div className="border-t border-ink-800/80 px-2 py-1.5">
          <div className="flex items-center gap-1.5 px-1.5 pb-1 text-[9.5px] font-semibold tracking-wider text-ink-500 uppercase">
            <Layers className="size-2.5" />
            {plural(data.sessions.length, 'compressed thread')}
          </div>
          <div className="space-y-1">
            {data.sessions.map((session) => (
              <SummaryBubble
                key={session.id}
                session={session}
                expanded={data.expandedSessions.includes(session.id)}
                onToggle={() => toggleSessionExpanded(id, session.id)}
              />
            ))}
          </div>
        </div>
      )}

      <footer className="flex items-center gap-2 border-t border-ink-800/80 px-3 py-2">
        <button
          className="nodrag inline-flex items-center gap-1.5 rounded-lg bg-ink-800 px-2.5 py-1.5 text-[11.5px] font-medium text-ink-200 ring-1 ring-ink-700 transition hover:bg-ink-700 hover:text-ink-100"
          onClick={(e) => {
            e.stopPropagation()
            selectNode(id)
          }}
        >
          <MessageSquare className="size-3" />
          {liveTurns > 0 ? `Live chat · ${liveTurns}` : 'Start chat'}
        </button>

        {streaming && (
          <span className="inline-flex items-center gap-1 text-[10.5px] text-accent">
            <Radio className="size-3 animate-pulse" />
            typing
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {archivedTurns > 0 && (
            <span className="text-[10.5px] text-ink-500" title="Messages retained under this node">
              {archivedTurns + liveTurns} msgs
            </span>
          )}
          {openCount > 0 && (
            <button
              className={`nodrag inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-semibold ring-1 ${meta.chip}`}
              onClick={(e) => {
                e.stopPropagation()
                selectNode(id)
                setSidebarTab('mistakes')
              }}
            >
              <TriangleAlert className="size-2.5" />
              {plural(openCount, 'gap')}
            </button>
          )}
          {data.status === 'unexplored' && (
            <span className="inline-flex items-center gap-1 text-[10.5px] text-ink-500">
              <Sparkles className="size-2.5" />
              untouched
            </span>
          )}
        </div>
      </footer>
    </div>
  )
})

function SummaryBubble({
  session,
  expanded,
  onToggle,
}: {
  session: Session
  expanded: boolean
  onToggle: () => void
}) {
  // Threads folded in from a correction drill are the highest-value revision
  // material on the canvas, so the bubble reads differently from an ordinary one.
  const fromFix = session.origin?.kind === 'correction'

  return (
    <div
      className={`nodrag overflow-hidden rounded-lg ring-1 transition-colors ${
        fromFix
          ? expanded
            ? 'bg-fix/12 ring-fix/45'
            : 'bg-fix/6 ring-fix/30 hover:ring-fix/50'
          : expanded
            ? 'bg-ink-900/80 ring-ink-600'
            : 'bg-ink-900/40 ring-ink-800 hover:ring-ink-600'
      }`}
    >
      <button
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left"
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
      >
        <ChevronRight
          className={`size-3 shrink-0 transition-transform duration-200 ${
            expanded ? 'rotate-90' : ''
          } ${fromFix ? 'text-fix' : 'text-ink-500'}`}
        />
        {fromFix && <Wrench className="size-2.5 shrink-0 text-fix" />}
        <span
          className={`min-w-0 flex-1 truncate text-[11.5px] font-medium ${
            fromFix ? 'text-fix' : 'text-ink-300'
          }`}
        >
          {session.title}
        </span>
        <span className="shrink-0 text-[9.5px] text-ink-600">
          {session.messages.length} · {session.closedAt ? relativeTime(session.closedAt) : ''}
        </span>
      </button>

      {expanded && (
        <div className="animate-rise px-2 pb-2">
          <p
            className={`mb-1.5 rounded-md px-2 py-1.5 text-[11px] leading-snug text-ink-300 ring-1 ${
              fromFix ? 'bg-fix/8 ring-fix/20' : 'bg-accent/8 ring-accent/15'
            }`}
          >
            {session.summary}
          </p>
          <div className="scrollbar-slim nowheel max-h-44 space-y-1.5 overflow-y-auto pr-1">
            {session.messages.map((m) => (
              <div key={m.id} className="text-[11px] leading-snug">
                <span
                  className={`mr-1.5 font-semibold ${
                    m.role === 'user' ? 'text-accent' : 'text-ink-500'
                  }`}
                >
                  {m.role === 'user' ? 'You' : 'AI'}
                </span>
                <span className={m.flaggedBy ? 'text-gap' : 'text-ink-400'}>
                  {truncate(stripMd(m.content), 190)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
