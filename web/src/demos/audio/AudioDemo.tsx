import { useState, useRef, useCallback } from "react";
import LoadingScreen from "../../components/LoadingScreen";

interface Props {
  onBack: () => void;
}

type AudioMode = "asr" | "tts" | "interleaved";
type WorkerStatus = "idle" | "loading" | "ready" | "processing" | "error";

interface InterleavedTurn {
  role: "user" | "assistant";
  text: string;
  audioUrl?: string;
}

function WaveformBars({ active }: { active: boolean }) {
  return (
    <div className="flex items-center gap-0.5 h-6">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="w-1 rounded-full bg-emerald-400 transition-all"
          style={{
            height: active ? `${8 + Math.floor(Math.random() * 16)}px` : "4px",
            animation: active
              ? `waveform 0.8s ease-in-out ${i * 0.15}s infinite`
              : "none",
          }}
        />
      ))}
    </div>
  );
}

function AudioPlayer({ url }: { url: string }) {
  return <audio controls src={url} className="w-full h-10 mt-2" />;
}

function createWavBlob(float32Array: Float32Array, sampleRate: number): string {
  const numChannels = 1;
  const bitsPerSample = 16;
  const dataLength = float32Array.length * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++)
      view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, (sampleRate * numChannels * bitsPerSample) / 8, true);
  view.setUint16(32, (numChannels * bitsPerSample) / 8, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataLength, true);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

export default function AudioDemo({ onBack }: Props) {
  const [mode, setMode] = useState<AudioMode>("asr");
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus>("idle");
  const [progress, setProgress] = useState({ progress: 0, status: "" });
  const [error, setError] = useState<string | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);

  // ASR state
  const [asrText, setAsrText] = useState("");
  const [asrAudioFile, setAsrAudioFile] = useState<File | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);

  // TTS state
  const [ttsInput, setTtsInput] = useState("");
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);

  // Interleaved state
  const [interleavedTurns, setInterleavedTurns] = useState<InterleavedTurn[]>(
    [],
  );
  const [streamingAssistant, setStreamingAssistant] = useState("");

  const workerRef = useRef<Worker | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const interleavedChunksRef = useRef<Blob[]>([]);

  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
      workerRef.current.addEventListener("message", (ev: MessageEvent) => {
        const { type: msgType, payload } = ev.data;
        if (msgType === "progress") {
          const pct =
            typeof payload.progress === "number" ? payload.progress / 100 : 0;
          setProgress({
            progress: pct,
            status: payload.file ?? payload.status ?? "",
          });
        } else if (msgType === "loaded") {
          setWorkerStatus("ready");
          setModelLoaded(true);
          setProgress({ progress: 1, status: "Model ready" });
        } else if (msgType === "error") {
          setError(payload.message as string);
          setWorkerStatus("error");
        } else if (msgType === "transcribed") {
          setAsrText(payload.text as string);
          setWorkerStatus("ready");
        } else if (msgType === "synthesized") {
          const url = createWavBlob(
            payload.audio as Float32Array,
            payload.samplingRate as number,
          );
          setTtsAudioUrl(url);
          setWorkerStatus("ready");
        } else if (msgType === "interleaved_transcribed") {
          setInterleavedTurns((prev) => [
            ...prev,
            { role: "user", text: payload.inputText as string },
          ]);
          setStreamingAssistant("");
        } else if (msgType === "interleaved_token") {
          setStreamingAssistant(payload.fullText as string);
        } else if (msgType === "interleaved_text_done") {
          // keep streaming display until audio is ready
        } else if (msgType === "interleaved_done") {
          const url = createWavBlob(
            payload.audio as Float32Array,
            payload.samplingRate as number,
          );
          setInterleavedTurns((prev) => [
            ...prev,
            {
              role: "assistant",
              text: payload.responseText as string,
              audioUrl: url,
            },
          ]);
          setStreamingAssistant("");
          setWorkerStatus("ready");
        }
      });
    }
    return workerRef.current;
  }, []);

  const handleLoad = () => {
    setWorkerStatus("loading");
    setError(null);
    setProgress({ progress: 0, status: "Initializing…" });
    getWorker().postMessage({ type: "load" });
  };

  const getAudioFloat32 = async (
    blob: Blob,
  ): Promise<{ audio: Float32Array; sampleRate: number }> => {
    const arrayBuffer = await blob.arrayBuffer();
    const audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    return {
      audio: audioBuffer.getChannelData(0),
      sampleRate: audioBuffer.sampleRate,
    };
  };

  const handleASR = async () => {
    const blob = recordedBlob ?? asrAudioFile;
    if (!blob) return;
    setWorkerStatus("processing");
    setAsrText("");
    try {
      const { audio, sampleRate } = await getAudioFloat32(blob);
      getWorker().postMessage(
        { type: "transcribe", payload: { audio, sampleRate } },
        [audio.buffer],
      );
    } catch (e) {
      setError(String(e));
      setWorkerStatus("ready");
    }
  };

  const handleTTS = () => {
    if (!ttsInput.trim()) return;
    setWorkerStatus("processing");
    setTtsAudioUrl(null);
    getWorker().postMessage({
      type: "synthesize",
      payload: { text: ttsInput },
    });
  };

  const startRecording = async (chunksTarget: Blob[]) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream);
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksTarget.push(e.data);
    };
    mr.onstop = () => stream.getTracks().forEach((t) => t.stop());
    mr.start(250);
    return mr;
  };

  const handleStartRecordASR = async () => {
    try {
      setRecordedBlob(null);
      chunksRef.current = [];
      mediaRecorderRef.current = await startRecording(chunksRef.current);
      setIsRecording(true);
    } catch (e) {
      setError("Microphone access denied: " + String(e));
    }
  };

  const handleStopRecordASR = () => {
    if (!mediaRecorderRef.current) return;
    mediaRecorderRef.current.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      setRecordedBlob(blob);
      mediaRecorderRef.current = null;
    };
    mediaRecorderRef.current.stop();
    setIsRecording(false);
  };

  const handleInterleavedRecord = async () => {
    if (isRecording) {
      // Stop and process
      if (!mediaRecorderRef.current) return;
      const localChunks = interleavedChunksRef.current;
      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(localChunks, { type: "audio/webm" });
        mediaRecorderRef.current = null;
        setIsRecording(false);
        setWorkerStatus("processing");
        try {
          const { audio, sampleRate } = await getAudioFloat32(blob);
          const history = interleavedTurns.map((t) => ({
            role: t.role,
            content: t.text,
          }));
          getWorker().postMessage(
            { type: "interleaved", payload: { audio, sampleRate, history } },
            [audio.buffer],
          );
        } catch (e) {
          setError(String(e));
          setWorkerStatus("ready");
        }
      };
      mediaRecorderRef.current.stop();
    } else {
      // Start recording
      try {
        interleavedChunksRef.current = [];
        mediaRecorderRef.current = await startRecording(
          interleavedChunksRef.current,
        );
        setIsRecording(true);
      } catch (e) {
        setError("Microphone access denied: " + String(e));
      }
    }
  };

  if (!modelLoaded) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="border-b border-white/10 px-6 py-4 flex items-center gap-4">
          <button
            onClick={onBack}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
          </button>
          <h1 className="font-semibold text-white">LFM2.5 Audio</h1>
        </header>
        {workerStatus === "loading" ? (
          <LoadingScreen
            progress={progress.progress}
            status={progress.status}
            modelName="Whisper Tiny + LFM2.5 Instruct + SpeechT5"
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-emerald-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                LFM2.5 Audio
              </h2>
              <p className="text-slate-400 max-w-md">
                Multimodal audio model for speech recognition, text-to-speech,
                and voice conversation — all running in your browser.
              </p>
            </div>
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 max-w-md">
              <ul className="text-sm text-slate-400 space-y-1.5">
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✦</span> ASR: speech to
                  text
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✦</span> TTS: text to
                  speech
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✦</span> Interleaved: voice
                  conversation with LLM
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✦</span> Models: Whisper
                  Tiny + LFM2.5 Instruct + SpeechT5
                </li>
              </ul>
            </div>
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300 max-w-md">
                {error}
              </div>
            )}
            <button
              onClick={handleLoad}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 px-8 rounded-xl transition-colors flex items-center gap-2"
            >
              Load Model
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7l5 5-5 5M6 12h12"
                />
              </svg>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/10 px-6 py-3 flex items-center gap-4 shrink-0">
        <button
          onClick={onBack}
          className="text-slate-400 hover:text-white transition-colors"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
        </button>
        <h1 className="font-semibold text-white text-sm">LFM2.5 Audio</h1>
        <span className="w-2 h-2 rounded-full bg-emerald-400 ml-1" />
        {workerStatus === "processing" && (
          <span className="text-xs text-slate-500 ml-2 animate-pulse">
            Processing…
          </span>
        )}
        <div className="ml-auto flex gap-1 bg-white/5 rounded-xl p-1">
          {(["asr", "tts", "interleaved"] as AudioMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                mode === m
                  ? "bg-emerald-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {m === "asr" ? "ASR" : m === "tts" ? "TTS" : "Interleaved"}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {/* ── ASR ── */}
        {mode === "asr" && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-white mb-1">
                Speech Recognition
              </h2>
              <p className="text-sm text-slate-400">
                Upload an audio file or record from your microphone to
                transcribe speech to text.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/3 p-6 flex flex-col items-center gap-4">
              <button
                onClick={
                  isRecording ? handleStopRecordASR : handleStartRecordASR
                }
                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                  isRecording
                    ? "bg-red-500 hover:bg-red-400 scale-110 ring-4 ring-red-500/20"
                    : "bg-emerald-600 hover:bg-emerald-500"
                }`}
              >
                {isRecording ? (
                  <div className="w-6 h-6 rounded bg-white" />
                ) : (
                  <svg
                    className="w-8 h-8 text-white"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4z" />
                    <path d="M5.5 9.643a.75.75 0 00-1.5 0V10c0 3.06 2.029 5.648 4.75 6.316V18.25a.75.75 0 001.5 0v-1.934A6.752 6.752 0 0016 10v-.357a.75.75 0 00-1.5 0V10a5.25 5.25 0 01-9 3.696V9.643z" />
                  </svg>
                )}
              </button>
              {isRecording && (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <WaveformBars active />
                  <span>Recording… tap to stop</span>
                </div>
              )}
              {recordedBlob && !isRecording && (
                <p className="text-xs text-emerald-400">Recording captured ✓</p>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-xs text-slate-500">or upload a file</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setAsrAudioFile(f);
                    setRecordedBlob(null);
                  }
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full border border-dashed border-white/20 rounded-xl py-8 text-slate-400 hover:text-white hover:border-emerald-500/40 transition-colors flex flex-col items-center gap-2"
              >
                <svg
                  className="w-8 h-8"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                  />
                </svg>
                <span className="text-sm">
                  {asrAudioFile ? asrAudioFile.name : "Click to upload audio"}
                </span>
              </button>
            </div>
            <button
              onClick={handleASR}
              disabled={
                (!recordedBlob && !asrAudioFile) ||
                workerStatus === "processing"
              }
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {workerStatus === "processing" ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Transcribing…
                </>
              ) : (
                "Transcribe"
              )}
            </button>
            {asrText && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <p className="text-xs text-emerald-400 font-medium mb-2">
                  Transcript
                </p>
                <p className="text-slate-200 text-sm whitespace-pre-wrap">
                  {asrText}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── TTS ── */}
        {mode === "tts" && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-white mb-1">
                Text to Speech
              </h2>
              <p className="text-sm text-slate-400">
                Type text and synthesize it to audio using the LFM2.5-Audio
                model.
              </p>
            </div>
            <textarea
              value={ttsInput}
              onChange={(e) => setTtsInput(e.target.value)}
              placeholder="Enter text to synthesize…"
              rows={5}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
            <button
              onClick={handleTTS}
              disabled={!ttsInput.trim() || workerStatus === "processing"}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {workerStatus === "processing" ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Synthesizing…
                </>
              ) : (
                "Synthesize Audio"
              )}
            </button>
            {ttsAudioUrl && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <p className="text-xs text-emerald-400 font-medium mb-2">
                  Generated Audio
                </p>
                <AudioPlayer url={ttsAudioUrl} />
              </div>
            )}
          </div>
        )}

        {/* ── Interleaved ── */}
        {mode === "interleaved" && (
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="text-center mb-4">
              <h2 className="text-lg font-semibold text-white mb-1">
                Voice Conversation
              </h2>
              <p className="text-sm text-slate-400">
                Speak to the model. It transcribes your voice, generates a
                reply, and speaks it back.
              </p>
            </div>

            {interleavedTurns.length === 0 && !streamingAssistant && (
              <div className="text-center py-12 text-slate-500">
                <svg
                  className="w-12 h-12 mx-auto mb-3 opacity-30"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                  />
                </svg>
                <p className="text-sm">
                  Press the mic button to start speaking
                </p>
              </div>
            )}

            <div className="space-y-3">
              {interleavedTurns.map((turn, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${turn.role === "user" ? "justify-end" : ""}`}
                >
                  {turn.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-1">
                      <svg
                        className="w-4 h-4 text-emerald-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                        />
                      </svg>
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                      turn.role === "user"
                        ? "bg-emerald-600 text-white rounded-br-sm"
                        : "bg-white/5 border border-white/10 text-slate-200 rounded-bl-sm"
                    }`}
                  >
                    <p
                      className={`text-xs mb-1 ${turn.role === "user" ? "text-emerald-200" : "text-slate-500"}`}
                    >
                      {turn.role === "user" ? "You" : "Assistant"}
                    </p>
                    {turn.text}
                    {turn.audioUrl && <AudioPlayer url={turn.audioUrl} />}
                  </div>
                  {turn.role === "user" && (
                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center shrink-0 mt-1">
                      <svg
                        className="w-4 h-4 text-slate-400"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}

              {streamingAssistant && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-1">
                    <div className="flex gap-0.5">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="w-1 h-1 rounded-full bg-emerald-400 thinking-dot"
                          style={{ animationDelay: `${i * 0.2}s` }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="max-w-[80%] bg-white/5 border border-white/10 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-slate-200">
                    <p className="text-xs text-slate-500 mb-1">Assistant</p>
                    {streamingAssistant}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col items-center gap-3 pt-4">
              <button
                onClick={handleInterleavedRecord}
                disabled={workerStatus === "processing"}
                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                  isRecording
                    ? "bg-red-500 hover:bg-red-400 scale-110 ring-4 ring-red-500/20"
                    : "bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
                }`}
              >
                {isRecording ? (
                  <div className="w-6 h-6 rounded bg-white" />
                ) : (
                  <svg
                    className="w-8 h-8 text-white"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4z" />
                    <path d="M5.5 9.643a.75.75 0 00-1.5 0V10c0 3.06 2.029 5.648 4.75 6.316V18.25a.75.75 0 001.5 0v-1.934A6.752 6.752 0 0016 10v-.357a.75.75 0 00-1.5 0V10a5.25 5.25 0 01-9 3.696V9.643z" />
                  </svg>
                )}
              </button>
              {isRecording && (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <WaveformBars active />
                  <span>Recording… tap to send</span>
                </div>
              )}
              {!isRecording &&
                interleavedTurns.length > 0 &&
                workerStatus === "ready" && (
                  <button
                    onClick={() => setInterleavedTurns([])}
                    className="text-xs text-slate-500 hover:text-white transition-colors"
                  >
                    Clear conversation
                  </button>
                )}
            </div>
          </div>
        )}

        {error && (
          <div className="max-w-2xl mx-auto mt-4">
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300">
              {error}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
