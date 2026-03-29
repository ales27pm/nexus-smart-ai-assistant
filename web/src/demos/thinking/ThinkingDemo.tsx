import { useState, useRef, useEffect, useCallback } from 'react'
import { useLLM } from './useLLM'
import LiquidIntro from './LiquidIntro'
import LoadingScreen from '../../components/LoadingScreen'
import { Streamdown, type PluginConfig } from 'streamdown'
import { math } from '@streamdown/math'
import 'streamdown/styles.css'

interface Props {
  onBack: () => void
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  thinkContent?: string
}

/** Split raw model output into <think>...</think> and the answer. */
function parseThinkBlocks(text: string): { think: string; answer: string } {
  const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>/i)
  if (thinkMatch) {
    return {
      think: thinkMatch[1].trim(),
      answer: text.replace(/<think>[\s\S]*?<\/think>/i, '').trim(),
    }
  }
  return { think: '', answer: text }
}

const mathPlugins: PluginConfig = { math }

function ThinkBlock({ content }: { content: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-3 rounded-xl border border-purple-500/20 bg-purple-500/5 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-purple-300 hover:bg-purple-500/10 transition-colors text-sm"
      >
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
        <span className="font-medium">{open ? 'Hide' : 'Show'} reasoning</span>
        <span className="ml-auto text-xs text-purple-400/60">{content.length.toLocaleString()} chars</span>
        <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-4 py-3 text-slate-400 text-sm border-t border-purple-500/10 max-h-64 overflow-y-auto">
          <Streamdown plugins={mathPlugins}>{content}</Streamdown>
        </div>
      )}
    </div>
  )
}

/** While the model is still outputting the <think> block, show a pulsing indicator. */
function ThinkingIndicator({ partialThink }: { partialThink: string }) {
  return (
    <div className="mb-3 rounded-xl border border-purple-500/20 bg-purple-500/5 px-4 py-3">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-1.5 h-1.5 rounded-full bg-purple-400 thinking-dot" style={{ animationDelay: `${i * 0.2}s` }} />
          ))}
        </div>
        <span className="text-xs text-purple-300">Thinking…</span>
      </div>
      {partialThink && (
        <p className="text-xs text-slate-500 line-clamp-2">{partialThink}</p>
      )}
    </div>
  )
}

function MessageBubble({ msg, streamingRaw }: { msg: Message; streamingRaw?: string }) {
  const isUser = msg.role === 'user'

  if (isUser) {
    return (
      <div className="flex gap-3 justify-end">
        <div className="max-w-[82%] bg-purple-600 text-white rounded-2xl rounded-br-sm px-4 py-3 text-sm whitespace-pre-wrap">
          {msg.content}
        </div>
        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center shrink-0 mt-1">
          <svg className="w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
          </svg>
        </div>
      </div>
    )
  }

  // Assistant message - streaming or settled
  if (streamingRaw !== undefined) {
    // Still streaming — parse on the fly
    const isInsideThink = streamingRaw.includes('<think>') && !streamingRaw.includes('</think>')
    const partialThink = isInsideThink ? streamingRaw.split('<think>')[1] ?? '' : ''
    const { think, answer } = parseThinkBlocks(streamingRaw)

    return (
      <div className="flex gap-3">
        <AssistantAvatar />
        <div className="max-w-[82%]">
          {isInsideThink
            ? <ThinkingIndicator partialThink={partialThink} />
            : think
              ? <ThinkBlock content={think} />
              : null}
          {!isInsideThink && (
            <div className="bg-white/5 border border-white/10 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-slate-200">
              <Streamdown plugins={mathPlugins}>{answer || '…'}</Streamdown>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Settled message
  return (
    <div className="flex gap-3">
      <AssistantAvatar />
      <div className="max-w-[82%]">
        {msg.thinkContent && <ThinkBlock content={msg.thinkContent} />}
        {msg.content && (
          <div className="bg-white/5 border border-white/10 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-slate-200">
            <Streamdown plugins={mathPlugins}>{msg.content}</Streamdown>
          </div>
        )}
      </div>
    </div>
  )
}

function AssistantAvatar() {
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 flex items-center justify-center shrink-0 mt-1">
      <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    </div>
  )
}

const INTRO_SEEN_KEY = 'liquidai-thinking-intro-seen'

const EXAMPLE_PROMPTS = [
  'Explain the Monty Hall problem and calculate the probability of winning if you always switch.',
  'Solve: If a train travels 120km at 60km/h, then 80km at 80km/h, what is the average speed?',
  'Prove that √2 is irrational.',
  'What is the sum of interior angles of a polygon with n sides? Derive with LaTeX.',
  'Explain why 0.1 + 0.2 ≠ 0.3 in floating point arithmetic.',
]

export default function ThinkingDemo({ onBack }: Props) {
  const [showIntro, setShowIntro] = useState(() => {
    try { return !localStorage.getItem(INTRO_SEEN_KEY) } catch { return true }
  })
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const { status, progress, error, loadModel, generate, abort, streaming } = useLLM()

  // Model is "loaded" only when status is ready or generating
  const modelLoaded = status === 'ready' || status === 'generating'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  const handleIntroDone = useCallback(() => {
    try { localStorage.setItem(INTRO_SEEN_KEY, '1') } catch { /* ignore */ }
    setShowIntro(false)
  }, [])

  const handleLoad = async () => {
    try {
      await loadModel()
    } catch { /* error shown via state */ }
  }

  const handleSend = useCallback(async () => {
    if (!input.trim() || status === 'generating') return
    const userMsg: Message = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')

    const apiMessages = newMessages.map((m) => ({ role: m.role, content: m.content }))

    try {
      const output = await generate(apiMessages)
      if (output) {
        const { think, answer } = parseThinkBlocks(output)
        setMessages((prev) => [...prev, { role: 'assistant', content: answer, thinkContent: think || undefined }])
      }
    } catch { /* handled by useLLM */ }
  }, [input, messages, status, generate])

  if (showIntro) {
    return <LiquidIntro onDone={handleIntroDone} />
  }

  if (!modelLoaded) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="border-b border-white/10 px-6 py-4 flex items-center gap-4">
          <button onClick={onBack} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <h1 className="font-semibold text-white">LFM2.5 Thinking</h1>
        </header>
        {status === 'loading' ? (
          <LoadingScreen
            progress={progress.progress}
            status={progress.status}
            modelName="onnx-community/LFM2.5-1.2B-Thinking-ONNX"
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">LFM2.5 Thinking</h2>
              <p className="text-slate-400 max-w-md">
                The reasoning model shows its chain-of-thought before answering. Explore collapsible think blocks and LaTeX math rendering.
              </p>
            </div>
            <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-4 max-w-md">
              <ul className="text-sm text-slate-400 space-y-1.5">
                <li className="flex items-center gap-2"><span className="text-purple-400">✦</span> Model: LFM2.5-1.2B-Thinking-ONNX</li>
                <li className="flex items-center gap-2"><span className="text-purple-400">✦</span> Up to 64K new tokens</li>
                <li className="flex items-center gap-2"><span className="text-purple-400">✦</span> KaTeX math via streamdown</li>
                <li className="flex items-center gap-2"><span className="text-purple-400">✦</span> Collapsible reasoning blocks</li>
              </ul>
            </div>
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300 max-w-md">
                {error}
              </div>
            )}
            <button
              onClick={handleLoad}
              className="bg-purple-600 hover:bg-purple-500 text-white font-medium py-3 px-8 rounded-xl transition-colors flex items-center gap-2"
            >
              Load Model
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5-5 5M6 12h12" />
              </svg>
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/10 px-6 py-3 flex items-center gap-4 shrink-0">
        <button onClick={onBack} className="text-slate-400 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div className="flex-1 flex items-center gap-3">
          <h1 className="font-semibold text-white text-sm">LFM2.5 Thinking</h1>
          <span className="text-xs text-slate-500 font-mono hidden sm:block">LFM2.5-1.2B-Thinking-ONNX</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
        </div>
        {status === 'generating' && (
          <button
            onClick={abort}
            className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20 transition-colors"
          >
            Stop
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-6 py-16">
            <p className="text-slate-500 text-sm">Ask a question that requires reasoning:</p>
            <div className="flex flex-col gap-2 w-full max-w-lg">
              {EXAMPLE_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => setInput(p)}
                  className="text-left text-sm px-4 py-3 rounded-xl bg-white/3 border border-white/10 text-slate-400 hover:text-white hover:border-purple-500/30 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}
        {status === 'generating' && (
          <MessageBubble
            msg={{ role: 'assistant', content: '' }}
            streamingRaw={streaming}
          />
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-white/10 p-4">
        <div className="flex gap-3 max-w-4xl mx-auto">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
            }}
            placeholder="Ask a reasoning question…"
            rows={2}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
          {status === 'generating' ? (
            <button
              onClick={abort}
              className="self-end bg-red-600/80 hover:bg-red-500 text-white p-3 rounded-xl transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 10a6 6 0 1112 0A6 6 0 014 10zm3.75-1.5h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 010-1.5z" clipRule="evenodd" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="self-end bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white p-3 rounded-xl transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
