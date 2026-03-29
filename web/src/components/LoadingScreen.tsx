interface Props {
  progress: number
  status: string
  modelName?: string
}

export default function LoadingScreen({ progress, status, modelName }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-8">
      <div className="relative w-20 h-20">
        <div className="absolute inset-0 rounded-full border-4 border-white/10" />
        <div
          className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-400 animate-spin"
          style={{ animationDuration: '1s' }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3.75H6.912a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3" />
          </svg>
        </div>
      </div>

      {modelName && (
        <p className="text-slate-400 text-sm font-mono">{modelName}</p>
      )}

      <div className="w-full max-w-md">
        <div className="flex justify-between text-xs text-slate-500 mb-2">
          <span className="truncate pr-4">{status || 'Loading model…'}</span>
          <span className="shrink-0">{Math.round(progress * 100)}%</span>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full progress-bar-animated transition-all duration-300"
            style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }}
          />
        </div>
      </div>

      <p className="text-xs text-slate-600 text-center max-w-xs">
        Model files are downloaded from Hugging Face and cached in your browser.
        This only happens once.
      </p>
    </div>
  )
}
