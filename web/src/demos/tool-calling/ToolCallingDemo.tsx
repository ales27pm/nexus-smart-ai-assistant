import { useState, useEffect, useRef, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { useLLM } from './useLLM'
import { extractToolCalls, executeToolCall, ToolResult } from './tools'
import { loadMessages, saveMessage, clearMessages, ChatMessage } from './db'
import { MODELS, DEFAULT_TOOLS_CODE, SYSTEM_PROMPT, EXAMPLE_PROMPTS } from './constants'
import LoadingScreen from '../../components/LoadingScreen'

interface Props {
  onBack: () => void
}

function ToolCallBadge({ name, args }: { name: string; args: Record<string, unknown> }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-2 rounded-lg border border-blue-500/20 bg-blue-500/5 overflow-hidden text-xs font-mono">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-blue-300 hover:bg-blue-500/10 transition-colors text-left"
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
        </svg>
        <span className="font-semibold">{name}(</span>
        {Object.entries(args).map(([k, v], i) => (
          <span key={k} className="text-slate-400">
            {k}={JSON.stringify(v)}{i < Object.entries(args).length - 1 ? ', ' : ''}
          </span>
        ))}
        <span className="font-semibold text-blue-300">)</span>
        <svg className={`w-3 h-3 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <pre className="px-3 py-2 text-emerald-300 border-t border-blue-500/10 overflow-x-auto">
          {JSON.stringify(args, null, 2)}
        </pre>
      )}
    </div>
  )
}

function ToolResultBlock({ result }: { result: ToolResult }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="mt-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 overflow-hidden text-xs font-mono">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-emerald-300 hover:bg-emerald-500/10 transition-colors text-left"
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
        </svg>
        <span>Result: {result.name}</span>
        {result.error && <span className="text-red-400 ml-2">Error</span>}
        <svg className={`w-3 h-3 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <pre className="px-3 py-2 text-slate-300 border-t border-emerald-500/10 overflow-x-auto">
          {JSON.stringify(result.result, null, 2)}
        </pre>
      )}
    </div>
  )
}

function MessageBubble({ msg, streaming }: { msg: ChatMessage; streaming?: string }) {
  const isUser = msg.role === 'user'
  const content = streaming !== undefined ? streaming : msg.content
  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center shrink-0 mt-1">
          <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
          </svg>
        </div>
      )}
      <div className={`max-w-[80%] ${isUser ? 'order-first' : ''}`}>
        <div className={`rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
          isUser
            ? 'bg-blue-600 text-white rounded-br-sm'
            : 'bg-white/5 border border-white/10 text-slate-200 rounded-bl-sm'
        }`}>
          {content || <span className="opacity-50 italic">…</span>}
        </div>
        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <div className="mt-2 space-y-1">
            {msg.toolCalls.map((tc, i) => (
              <div key={i}>
                <ToolCallBadge name={tc.name} args={tc.args} />
                <ToolResultBlock result={{ name: tc.name, args: tc.args, result: tc.result }} />
              </div>
            ))}
          </div>
        )}
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center shrink-0 mt-1">
          <svg className="w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
          </svg>
        </div>
      )}
    </div>
  )
}

export default function ToolCallingDemo({ onBack }: Props) {
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [showTools, setShowTools] = useState(false)
  const [toolsCode, setToolsCode] = useState(DEFAULT_TOOLS_CODE)
  const bottomRef = useRef<HTMLDivElement>(null)
  const { status, progress, error, loadModel, generate, abort, streaming } = useLLM()

  // Model is considered loaded only when status is ready or generating
  const modelLoaded = status === 'ready' || status === 'generating'

  useEffect(() => {
    loadMessages().then(setMessages)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  const handleLoad = async () => {
    try {
      await loadModel(selectedModel)
    } catch {
      // error shown via state
    }
  }

  const handleSend = useCallback(async () => {
    if (!input.trim() || status === 'generating') return
    const userMsg: ChatMessage = { role: 'user', content: input.trim(), timestamp: Date.now() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    await saveMessage(userMsg)

    const apiMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...newMessages.map((m) => ({ role: m.role === 'tool' ? 'assistant' : m.role, content: m.content })),
    ]

    try {
      const output = await generate(apiMessages, 512)
      if (!output) return  // aborted — no message to append

      const { calls, cleanText } = extractToolCalls(output)

      const toolResults: ChatMessage['toolCalls'] = []
      for (const call of calls) {
        const result = await executeToolCall(call, toolsCode)
        toolResults.push({ name: call.name, args: call.args, result })
      }

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: cleanText,
        toolCalls: toolResults.length ? toolResults : undefined,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, assistantMsg])
      await saveMessage(assistantMsg)
    } catch {
      // error handled by useLLM
    }
  }, [input, messages, status, generate, toolsCode])

  const handleClear = async () => {
    await clearMessages()
    setMessages([])
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
          <h1 className="font-semibold text-white">LFM2 Tool Calling</h1>
        </header>
        {status === 'loading' ? (
          <LoadingScreen progress={progress.progress} status={progress.status} modelName={selectedModel} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">LFM2 Tool Calling</h2>
              <p className="text-slate-400 max-w-md">Chat with LFM2 and watch it use Python-style tools in real time. Edit tool definitions, and your conversation persists across page reloads.</p>
            </div>
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300 max-w-md">
                {error}
              </div>
            )}
            <div className="w-full max-w-md space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Model</label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id} className="bg-[#1e2130]">{m.label}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleLoad}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                Load Model
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5-5 5M6 12h12" />
                </svg>
              </button>
            </div>
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
          <h1 className="font-semibold text-white text-sm">LFM2 Tool Calling</h1>
          <span className="text-xs text-slate-500 font-mono hidden sm:block">{MODELS.find(m => m.id === selectedModel)?.label}</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400" title="Model loaded" />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTools(!showTools)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${showTools ? 'bg-blue-500/20 border-blue-500/30 text-blue-300' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}
          >
            {showTools ? 'Hide tools' : 'Edit tools'}
          </button>
          <button
            onClick={handleClear}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-colors"
          >
            Clear
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Chat panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-6 py-16">
                <p className="text-slate-500 text-sm">Try one of these prompts:</p>
                <div className="flex flex-col gap-2 w-full max-w-md">
                  {EXAMPLE_PROMPTS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setInput(p)}
                      className="text-left text-sm px-4 py-3 rounded-xl bg-white/3 border border-white/10 text-slate-400 hover:text-white hover:border-blue-500/30 transition-colors"
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
                msg={{ role: 'assistant', content: '', timestamp: Date.now() }}
                streaming={streaming || '…'}
              />
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-white/10 p-4">
            <div className="flex gap-3 max-w-4xl mx-auto">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="Type a message…"
                rows={2}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50"
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
                  className="self-end bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white p-3 rounded-xl transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tools panel */}
        {showTools && (
          <div className="w-[420px] border-l border-white/10 flex flex-col">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-medium text-white">Tool Definitions</h3>
              <span className="text-xs text-slate-500">Python-style</span>
            </div>
            <div className="flex-1 min-h-0">
              <Editor
                height="100%"
                defaultLanguage="python"
                theme="vs-dark"
                value={toolsCode}
                onChange={(val) => { if (val !== undefined) setToolsCode(val) }}
                options={{
                  minimap: { enabled: false },
                  fontSize: 12,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  automaticLayout: true,
                  tabSize: 4,
                  insertSpaces: true,
                }}
              />
            </div>
            <div className="px-4 py-3 border-t border-white/10 shrink-0">
              <button
                onClick={() => setToolsCode(DEFAULT_TOOLS_CODE)}
                className="text-xs text-slate-400 hover:text-white transition-colors"
              >
                Reset to defaults
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
