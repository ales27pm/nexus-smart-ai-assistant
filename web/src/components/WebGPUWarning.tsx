export default function WebGPUWarning() {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500/10 border-b border-amber-500/30 px-4 py-3">
      <div className="max-w-4xl mx-auto flex items-center gap-3">
        <svg className="w-5 h-5 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
        <p className="text-amber-300 text-sm">
          <span className="font-semibold">WebGPU not detected.</span>{' '}
          These demos require a WebGPU-enabled browser. Please use Chrome or Edge 113+ on desktop.
        </p>
      </div>
    </div>
  )
}
