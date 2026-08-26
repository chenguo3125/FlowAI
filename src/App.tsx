import { ReactFlowProvider } from '@xyflow/react'

import { Canvas } from '@/components/Canvas'
import { ChatSidebar } from '@/components/ChatSidebar'
import { TopBar } from '@/components/TopBar'

export default function App() {
  return (
    <ReactFlowProvider>
      <div className="flex h-full flex-col bg-ink-950">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1">
            <Canvas />
          </main>
          <ChatSidebar />
        </div>
      </div>
    </ReactFlowProvider>
  )
}
