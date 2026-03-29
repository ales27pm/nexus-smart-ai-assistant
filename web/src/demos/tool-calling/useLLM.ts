import { useRef, useState, useCallback } from 'react'

export type LLMStatus = 'idle' | 'loading' | 'ready' | 'generating' | 'error'

export interface LLMProgress {
  progress: number
  status: string
}

export interface UseLLMReturn {
  status: LLMStatus
  progress: LLMProgress
  error: string | null
  loadModel: (modelId: string) => Promise<void>
  generate: (messages: Array<{ role: string; content: string }>, maxNewTokens?: number) => Promise<string>
  abort: () => void
  streaming: string
}

export function useLLM(): UseLLMReturn {
  const workerRef = useRef<Worker | null>(null)
  const modelIdRef = useRef<string>('')
  const [status, setStatus] = useState<LLMStatus>('idle')
  const [progress, setProgress] = useState<LLMProgress>({ progress: 0, status: '' })
  const [error, setError] = useState<string | null>(null)
  const [streaming, setStreaming] = useState('')
  const resolveRef = useRef<((v: string) => void) | null>(null)
  const rejectRef = useRef<((e: Error) => void) | null>(null)

  const createWorker = useCallback(() => {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    w.addEventListener('message', (ev: MessageEvent) => {
      const { type, payload } = ev.data
      if (type === 'progress') {
        const pct = typeof payload.progress === 'number' ? payload.progress / 100 : 0
        setProgress({ progress: pct, status: payload.file ?? payload.status ?? 'Loading…' })
      } else if (type === 'loaded') {
        setStatus('ready')
        setProgress({ progress: 1, status: 'Model ready' })
      } else if (type === 'token') {
        setStreaming(payload.fullOutput)
      } else if (type === 'done') {
        setStatus('ready')
        setStreaming('')
        resolveRef.current?.(payload.fullOutput)
      } else if (type === 'aborted') {
        setStatus('ready')
        setStreaming('')
        resolveRef.current?.('')
      } else if (type === 'error') {
        setStatus('error')
        setError(payload.message)
        rejectRef.current?.(new Error(payload.message))
      }
    })
    return w
  }, [])

  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = createWorker()
    }
    return workerRef.current
  }, [createWorker])

  const loadModel = useCallback(async (modelId: string) => {
    setStatus('loading')
    setError(null)
    setProgress({ progress: 0, status: 'Initializing…' })
    const worker = getWorker()
    modelIdRef.current = modelId
    return new Promise<void>((resolve, reject) => {
      const handler = (ev: MessageEvent) => {
        if (ev.data.type === 'loaded') {
          worker.removeEventListener('message', handler)
          resolve()
        } else if (ev.data.type === 'error') {
          worker.removeEventListener('message', handler)
          reject(new Error(ev.data.payload.message))
        }
      }
      worker.addEventListener('message', handler)
      worker.postMessage({ type: 'load', payload: { modelId } })
    })
  }, [getWorker])

  const generate = useCallback(async (
    messages: Array<{ role: string; content: string }>,
    maxNewTokens = 512,
  ): Promise<string> => {
    const worker = getWorker()
    setStatus('generating')
    setStreaming('')
    return new Promise<string>((resolve, reject) => {
      resolveRef.current = resolve
      rejectRef.current = reject
      worker.postMessage({ type: 'generate', payload: { messages, maxNewTokens } })
    })
  }, [getWorker])

  const abort = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
    }
    // Model is gone after termination — require reload
    modelIdRef.current = ''
    setStatus('idle')
    setStreaming('')
    resolveRef.current?.('')
  }, [])

  return { status, progress, error, loadModel, generate, abort, streaming }
}
