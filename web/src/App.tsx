import { useState, useEffect } from 'react'
import Hub from './components/Hub'
import ToolCallingDemo from './demos/tool-calling/ToolCallingDemo'
import ThinkingDemo from './demos/thinking/ThinkingDemo'
import AudioDemo from './demos/audio/AudioDemo'
import WebGPUWarning from './components/WebGPUWarning'

export type DemoId = 'hub' | 'tool-calling' | 'thinking' | 'audio'

function checkWebGPU(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

export default function App() {
  const [activeDemo, setActiveDemo] = useState<DemoId>('hub')
  const [gpuSupported] = useState<boolean>(checkWebGPU)

  useEffect(() => {
    const hash = window.location.hash.replace('#', '') as DemoId
    if (['tool-calling', 'thinking', 'audio'].includes(hash)) {
      setActiveDemo(hash as DemoId)
    }
  }, [])

  const navigate = (demo: DemoId) => {
    setActiveDemo(demo)
    window.location.hash = demo === 'hub' ? '' : demo
  }

  return (
    <div className="min-h-screen bg-[#0f1117] text-slate-200">
      {!gpuSupported && <WebGPUWarning />}
      {activeDemo === 'hub' && <Hub onSelect={navigate} gpuSupported={gpuSupported} />}
      {activeDemo === 'tool-calling' && <ToolCallingDemo onBack={() => navigate('hub')} />}
      {activeDemo === 'thinking' && <ThinkingDemo onBack={() => navigate('hub')} />}
      {activeDemo === 'audio' && <AudioDemo onBack={() => navigate('hub')} />}
    </div>
  )
}
