import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ViewportPortal,
  useReactFlow,
  type NodeMouseHandler,
} from '@xyflow/react'
import { BadgeCheck } from 'lucide-react'
import { useCallback, useMemo } from 'react'

import { TopicNode } from '@/components/TopicNode'
import { STATUS_META } from '@/lib/status'
import { GHOST_TTL, NODE_WIDTH, useCanvas, type FlowNode } from '@/store/canvasStore'
import { useTheme } from '@/store/themeStore'
import type { MasteryStatus } from '@/types'

export function Canvas() {
  const nodes = useCanvas((s) => s.nodes)
  const edges = useCanvas((s) => s.edges)
  const onNodesChange = useCanvas((s) => s.onNodesChange)
  const onEdgesChange = useCanvas((s) => s.onEdgesChange)
  const onConnect = useCanvas((s) => s.onConnect)
  const selectNode = useCanvas((s) => s.selectNode)
  const addNode = useCanvas((s) => s.addNode)
  const selectedNodeId = useCanvas((s) => s.selectedNodeId)

  const theme = useTheme((s) => s.theme)

  const { screenToFlowPosition } = useReactFlow()
  const nodeTypes = useMemo(() => ({ topic: TopicNode }), [])

  // Keep exactly one node highlighted, including when selection is driven from
  // the sidebar rather than a canvas click.
  const decorated = useMemo(
    () =>
      nodes.map((n) => {
        const selected = n.id === selectedNodeId
        return n.selected === selected ? n : { ...n, selected }
      }),
    [nodes, selectedNodeId],
  )

  const onNodeClick = useCallback<NodeMouseHandler<FlowNode>>(
    (_, node) => selectNode(node.id),
    [selectNode],
  )

  const onDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      // React Flow has no onPaneDoubleClick, so ignore double-clicks on cards.
      if (!(event.target as HTMLElement).classList.contains('react-flow__pane')) return
      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      addNode({ x: pos.x - NODE_WIDTH / 2, y: pos.y - 40 })
    },
    [addNode, screenToFlowPosition],
  )

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={decorated}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={() => selectNode(null)}
        onDoubleClick={onDoubleClick}
        zoomOnDoubleClick={false}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        // React Flow puts this on its own container, where it drives the
        // `--xy-*` defaults that index.css builds the canvas palette on top of.
        colorMode={theme}
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={1.6}
        fitView
        fitViewOptions={{ padding: 0.22, maxZoom: 0.85 }}
        nodesDraggable
        elevateNodesOnSelect
        selectionOnDrag={false}
        panOnDrag
        deleteKeyCode={null}
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1.4} />
        <Controls position="bottom-right" showInteractive={false} />
        <Ghosts />
        <MiniMap
          position="top-right"
          pannable
          zoomable
          nodeClassName={(n) => `minimap-${(n as FlowNode).data.status}`}
          nodeStrokeWidth={0}
          nodeBorderRadius={4}
        />
      </ReactFlow>

      <Legend />
    </div>
  )
}

/**
 * The trace left where a correction node stood. Rendered through
 * ViewportPortal so it pans and zooms with the canvas without joining the node
 * graph — it is feedback, not a member of the network.
 */
function Ghosts() {
  const ghosts = useCanvas((s) => s.ghosts)
  if (ghosts.length === 0) return null

  return (
    <ViewportPortal>
      {ghosts.map((ghost) => (
        <div
          key={ghost.id}
          className="animate-fade-out pointer-events-none absolute"
          style={{
            transform: `translate(${ghost.position.x}px, ${ghost.position.y}px)`,
            width: NODE_WIDTH,
            animationDuration: `${GHOST_TTL}ms`,
          }}
        >
          <div className="rounded-2xl border border-dashed border-solid/45 bg-solid/5 px-3.5 py-3">
            <div className="flex items-center gap-2">
              <BadgeCheck className="size-3.5 shrink-0 text-solid" />
              <span className="truncate text-[12.5px] font-medium text-ink-300 line-through decoration-ink-500">
                {ghost.title}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-ink-500">
              Gap closed · thread folded into the parent topic
            </p>
          </div>
        </div>
      ))}
    </ViewportPortal>
  )
}

function Legend() {
  const nodes = useCanvas((s) => s.nodes)
  const counts = useMemo(() => {
    const acc: Record<MasteryStatus, number> = { unexplored: 0, solid: 0, shaky: 0, gap: 0 }
    for (const n of nodes) acc[n.data.status] += 1
    return acc
  }, [nodes])

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-3 rounded-xl glass px-3 py-2 ring-1 ring-ink-700">
      {(['solid', 'shaky', 'gap', 'unexplored'] as MasteryStatus[]).map((status) => (
        <div key={status} className="flex items-center gap-1.5">
          <span className={`size-2 rounded-full ${STATUS_META[status].dot}`} />
          <span className="text-[11px] text-ink-400">{STATUS_META[status].label}</span>
          <span className="text-[11px] font-semibold text-ink-300">{counts[status]}</span>
        </div>
      ))}
      <span className="ml-1 border-l border-ink-700 pl-3 text-[11px] text-ink-500">
        double-click canvas to add a node
      </span>
    </div>
  )
}
