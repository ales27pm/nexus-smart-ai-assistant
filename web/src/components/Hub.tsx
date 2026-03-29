import { DemoId } from '../App'

interface DemoCard {
  id: DemoId
  title: string
  subtitle: string
  description: string
  features: string[]
  model: string
  color: string
  gradient: string
  icon: React.ReactNode
}

const demos: DemoCard[] = [
  {
    id: 'tool-calling',
    title: 'LFM2 Tool Calling',
    subtitle: 'Python-style tool use',
    description: 'Chat with LFM2 and watch it call custom tools — all in your browser. Edit tool definitions in a live code editor, and your conversation persists across reloads.',
    features: ['Tool call execution', 'Monaco code editor', 'Persistent chat history', '350M / 700M / 1.2B variants'],
    model: 'LFM2-350M / 700M / 1.2B',
    color: 'blue',
    gradient: 'from-blue-500/20 to-indigo-500/20',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
      </svg>
    ),
  },
  {
    id: 'thinking',
    title: 'LFM2.5 Thinking',
    subtitle: 'Reasoning model with chain-of-thought',
    description: 'The LFM2.5-1.2B thinking model works through problems step-by-step before answering. Explore its reasoning with collapsible think blocks and LaTeX math rendering.',
    features: ['Chain-of-thought reasoning', 'Collapsible think blocks', 'LaTeX math rendering', 'Up to 64K tokens'],
    model: 'LFM2.5-1.2B-Thinking',
    color: 'purple',
    gradient: 'from-purple-500/20 to-pink-500/20',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
  },
  {
    id: 'audio',
    title: 'LFM2.5 Audio',
    subtitle: 'Speech recognition, synthesis & conversation',
    description: 'A multimodal audio model running entirely in-browser. Transcribe speech, synthesize text to audio, or hold a full voice conversation with the model.',
    features: ['ASR (speech-to-text)', 'TTS (text-to-speech)', 'Interleaved voice chat', 'Microphone & file upload'],
    model: 'LFM2.5-Audio-1.5B',
    color: 'emerald',
    gradient: 'from-emerald-500/20 to-teal-500/20',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
      </svg>
    ),
  },
]

const colorMap: Record<string, string> = {
  blue: 'border-blue-500/30 hover:border-blue-400/60',
  purple: 'border-purple-500/30 hover:border-purple-400/60',
  emerald: 'border-emerald-500/30 hover:border-emerald-400/60',
}
const iconColorMap: Record<string, string> = {
  blue: 'text-blue-400 bg-blue-500/10',
  purple: 'text-purple-400 bg-purple-500/10',
  emerald: 'text-emerald-400 bg-emerald-500/10',
}
const badgeColorMap: Record<string, string> = {
  blue: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  purple: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
  emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
}
const btnColorMap: Record<string, string> = {
  blue: 'bg-blue-600 hover:bg-blue-500',
  purple: 'bg-purple-600 hover:bg-purple-500',
  emerald: 'bg-emerald-600 hover:bg-emerald-500',
}

interface Props {
  onSelect: (id: DemoId) => void
  gpuSupported: boolean
}

export default function Hub({ onSelect, gpuSupported }: Props) {
  return (
    <div className={`min-h-screen bg-[#0f1117] ${!gpuSupported ? 'pt-14' : ''}`}>
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 via-purple-900/10 to-emerald-900/20 pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-6 py-20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-slate-400 mb-6">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Runs 100% in your browser — no server, no API key
          </div>
          <h1 className="text-5xl font-bold tracking-tight text-white mb-4">
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent">
              LiquidAI
            </span>{' '}
            WebGPU Demos
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Explore LFM2 and LFM2.5 language models running entirely client-side via WebGPU. 
            Models load once, stream locally, and your data never leaves your device.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3 text-sm text-slate-500">
            <span className="flex items-center gap-1.5"><svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg> WebGPU accelerated</span>
            <span className="flex items-center gap-1.5"><svg className="w-4 h-4 text-purple-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg> ONNX Runtime</span>
            <span className="flex items-center gap-1.5"><svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg> Chrome / Edge 113+</span>
          </div>
        </div>
      </div>

      {/* Demo cards */}
      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 gap-6">
          {demos.map((demo) => (
            <div
              key={demo.id}
              className={`relative group rounded-2xl border bg-white/3 backdrop-blur-sm transition-all duration-300 overflow-hidden cursor-pointer ${colorMap[demo.color]}`}
              onClick={() => onSelect(demo.id)}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${demo.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none`} />
              <div className="relative p-8">
                <div className="flex items-start gap-5">
                  <div className={`p-3 rounded-xl shrink-0 ${iconColorMap[demo.color]}`}>
                    {demo.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-3 mb-2">
                      <h2 className="text-xl font-semibold text-white">{demo.title}</h2>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${badgeColorMap[demo.color]}`}>
                        {demo.model}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400 mb-4">{demo.description}</p>
                    <div className="flex flex-wrap gap-2">
                      {demo.features.map((f) => (
                        <span key={f} className="text-xs px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-400">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    className={`shrink-0 hidden sm:flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-colors ${btnColorMap[demo.color]}`}
                    onClick={(e) => { e.stopPropagation(); onSelect(demo.id) }}
                  >
                    Open demo
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5-5 5M6 12h12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-slate-600 mt-12">
          Models are downloaded from Hugging Face on first use and cached in your browser.
          Large models may take a moment on first load.
        </p>
      </div>
    </div>
  )
}
