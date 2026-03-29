import { useEffect, useState } from 'react'

interface Props {
  onDone: () => void
}

export default function LiquidIntro({ onDone }: Props) {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2000),
      setTimeout(() => onDone(), 3200),
    ]
    return () => timers.forEach(clearTimeout)
  }, [onDone])

  return (
    <div className="fixed inset-0 z-50 bg-[#0f1117] flex items-center justify-center overflow-hidden">
      {/* Liquid blobs */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-600/20 blur-3xl"
          style={{
            borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%',
            animation: 'liquid-flow 8s ease-in-out infinite',
            transform: `translate(-50%, -50%) scale(${phase >= 1 ? 1 : 0.3})`,
            transition: 'transform 1s cubic-bezier(0.34, 1.56, 0.64, 1)',
            opacity: phase >= 3 ? 0 : 1,
          }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-blue-600/15 blur-2xl"
          style={{
            borderRadius: '40% 60% 70% 30% / 40% 60% 30% 60%',
            animation: 'liquid-flow 6s ease-in-out infinite reverse',
            transform: `translate(-40%, -60%) scale(${phase >= 1 ? 1 : 0.2})`,
            transition: 'transform 0.8s ease-out 0.2s',
            opacity: phase >= 3 ? 0 : 1,
          }}
        />
      </div>

      {/* Logo text */}
      <div className="relative z-10 text-center">
        <div
          className="text-6xl font-bold tracking-tight mb-3"
          style={{
            opacity: phase >= 1 ? 1 : 0,
            transform: phase >= 1 ? 'translateY(0)' : 'translateY(20px)',
            transition: 'all 0.7s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Liquid
          </span>
          <span className="text-white">AI</span>
        </div>
        <div
          className="text-slate-400 text-lg font-light tracking-wide"
          style={{
            opacity: phase >= 2 ? 1 : 0,
            transform: phase >= 2 ? 'translateY(0)' : 'translateY(10px)',
            transition: 'all 0.5s ease-out',
          }}
        >
          LFM2.5 Thinking
        </div>

        {/* Dots */}
        <div
          className="flex justify-center gap-2 mt-6"
          style={{
            opacity: phase >= 2 ? 1 : 0,
            transition: 'opacity 0.4s ease-out 0.2s',
          }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-purple-400 thinking-dot"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
      </div>

      {/* Skip button */}
      <button
        onClick={onDone}
        className="absolute bottom-8 right-8 text-xs text-slate-600 hover:text-slate-400 transition-colors"
      >
        Skip intro
      </button>
    </div>
  )
}
