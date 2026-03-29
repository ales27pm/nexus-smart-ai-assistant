import {
  TextStreamer,
  env,
  type AutomaticSpeechRecognitionPipeline,
  type TextGenerationPipeline,
  type TextToAudioPipeline,
} from '@huggingface/transformers'

env.allowLocalModels = false

const MODEL_ID = 'LiquidAI/LFM2.5-Audio-1.5B-ONNX'
const ASR_SAMPLE_RATE = 16000

type PipelineTask = 'automatic-speech-recognition' | 'text-generation' | 'text-to-audio'
type PipelineResult = AutomaticSpeechRecognitionPipeline | TextGenerationPipeline | TextToAudioPipeline

async function loadPipeline(task: PipelineTask, model: string, opts: Record<string, unknown>): Promise<PipelineResult> {
  const { pipeline } = await import('@huggingface/transformers')
  return pipeline(task as 'text-generation', model, opts as Parameters<typeof pipeline>[2]) as unknown as PipelineResult
}

let asrPipeline: AutomaticSpeechRecognitionPipeline | null = null
let llmPipeline: TextGenerationPipeline | null = null
let ttsPipeline: TextToAudioPipeline | null = null
let loaded = false

/** Resample Float32Array from inputRate to targetRate using linear interpolation. */
function resample(audio: Float32Array, inputRate: number, targetRate: number): Float32Array {
  if (inputRate === targetRate) return audio
  const ratio = inputRate / targetRate
  const outputLength = Math.round(audio.length / ratio)
  const output = new Float32Array(outputLength)
  for (let i = 0; i < outputLength; i++) {
    const srcIdx = i * ratio
    const lo = Math.floor(srcIdx)
    const hi = Math.min(lo + 1, audio.length - 1)
    const t = srcIdx - lo
    output[i] = audio[lo] * (1 - t) + audio[hi] * t
  }
  return output
}

function postTransfer(msg: unknown, buffer: ArrayBufferLike): void {
  ;(self as unknown as { postMessage(m: unknown, t: Transferable[]): void }).postMessage(msg, [buffer as ArrayBuffer])
}

self.addEventListener('message', async (event: MessageEvent) => {
  const { type, payload } = event.data

  if (type === 'load') {
    if (loaded) { self.postMessage({ type: 'loaded' }); return }
    try {
      const progressCb = (p: { status: string; progress?: number; file?: string }) => {
        self.postMessage({ type: 'progress', payload: p })
      }

      const baseOpts = { dtype: 'q4', device: 'webgpu', progress_callback: progressCb }

      asrPipeline = (await loadPipeline('automatic-speech-recognition', MODEL_ID, baseOpts)) as AutomaticSpeechRecognitionPipeline
      llmPipeline = (await loadPipeline('text-generation', MODEL_ID, baseOpts)) as TextGenerationPipeline
      ttsPipeline = (await loadPipeline('text-to-audio', MODEL_ID, baseOpts)) as TextToAudioPipeline

      loaded = true
      self.postMessage({ type: 'loaded' })
    } catch (err) {
      self.postMessage({ type: 'error', payload: { message: String(err) } })
    }
    return
  }

  if (type === 'transcribe') {
    if (!asrPipeline) { self.postMessage({ type: 'error', payload: { message: 'ASR model not loaded' } }); return }
    try {
      const { audio, sampleRate } = payload as { audio: Float32Array; sampleRate: number }
      const resampled = resample(audio, sampleRate, ASR_SAMPLE_RATE)
      const result = await asrPipeline(resampled)
      const single = Array.isArray(result) ? result[0] : result
      const text = (single as { text?: string })?.text ?? ''
      self.postMessage({ type: 'transcribed', payload: { text } })
    } catch (err) {
      self.postMessage({ type: 'error', payload: { message: String(err) } })
    }
    return
  }

  if (type === 'synthesize') {
    if (!ttsPipeline) { self.postMessage({ type: 'error', payload: { message: 'TTS model not loaded' } }); return }
    try {
      const { text } = payload as { text: string }
      const result = await ttsPipeline(text, {}) as { audio: Float32Array; sampling_rate: number }
      postTransfer(
        { type: 'synthesized', payload: { audio: result.audio, samplingRate: result.sampling_rate } },
        result.audio.buffer
      )
    } catch (err) {
      self.postMessage({ type: 'error', payload: { message: String(err) } })
    }
    return
  }

  if (type === 'interleaved') {
    if (!asrPipeline || !llmPipeline || !ttsPipeline) {
      self.postMessage({ type: 'error', payload: { message: 'Models not loaded' } })
      return
    }
    try {
      const { audio, sampleRate, history } = payload as {
        audio: Float32Array
        sampleRate: number
        history: Array<{ role: string; content: string }>
      }

      // Step 1: Transcribe user speech (resample to 16kHz first)
      const resampled = resample(audio, sampleRate, ASR_SAMPLE_RATE)
      const asrResult = await asrPipeline(resampled)
      const asrSingle = Array.isArray(asrResult) ? asrResult[0] : asrResult
      const inputText = (asrSingle as { text?: string })?.text?.trim() ?? ''
      self.postMessage({ type: 'interleaved_transcribed', payload: { inputText } })

      // Step 2: Generate assistant text response
      const messages = [
        { role: 'system', content: 'You are a helpful voice assistant. Give brief, natural spoken responses.' },
        ...history,
        { role: 'user', content: inputText },
      ]

      let responseText = ''
      const streamer = new TextStreamer(llmPipeline.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (chunk: string) => {
          responseText += chunk
          self.postMessage({ type: 'interleaved_token', payload: { token: chunk, fullText: responseText } })
        },
      })

      await llmPipeline(messages, {
        max_new_tokens: 256,
        do_sample: true,
        temperature: 0.7,
        streamer,
      })

      // Step 3: Synthesize the reply to audio
      const ttsResult = await ttsPipeline(responseText, {}) as { audio: Float32Array; sampling_rate: number }
      postTransfer(
        {
          type: 'interleaved_done',
          payload: { inputText, responseText, audio: ttsResult.audio, samplingRate: ttsResult.sampling_rate },
        },
        ttsResult.audio.buffer
      )
    } catch (err) {
      self.postMessage({ type: 'error', payload: { message: String(err) } })
    }
    return
  }
})
