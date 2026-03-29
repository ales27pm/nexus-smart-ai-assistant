# LiquidAI WebGPU Demos

## Overview
A unified React + Vite web application hosting three LiquidAI in-browser AI demos, all running entirely client-side via WebGPU using `@huggingface/transformers` and ONNX runtime. No server or API key required — everything runs in the user's browser.

## Applications

### Web App (primary) — `web/`
Three LiquidAI demos under one hub:

1. **LFM2 Tool Calling** — Chat with LFM2 (350M/700M/1.2B) with Python-style tool-calling, editable tool definitions, IndexedDB-persisted chat history.
2. **LFM2.5 Thinking** — Reasoning chat with animated LiquidIntro, collapsible `<think>` blocks, KaTeX math rendering, up to 64K tokens.
3. **LFM2.5 Audio** — Multimodal: ASR (speech-to-text), TTS (text-to-speech), Interleaved voice conversation.

### Mobile App (legacy) — `expo/`
Expo (React Native) AI assistant app — not actively developed. Do not modify.

## Architecture
- **Framework**: Vite + React 19 + TypeScript
- **Styling**: Tailwind CSS v4
- **AI Runtime**: `@huggingface/transformers` (WebGPU/ONNX)
- **Math rendering**: KaTeX via rehype-katex + remark-math
- **Chat persistence**: IndexedDB via `idb`
- **Workers**: Each demo uses a Web Worker for off-main-thread inference

## Project Structure
```
web/
  src/
    App.tsx                    # Root with hash-based routing
    main.tsx                   # Entry point
    index.css                  # Global styles + Tailwind
    components/
      Hub.tsx                  # Landing page with 3 demo cards
      LoadingScreen.tsx        # Progress bar loading screen
      WebGPUWarning.tsx        # Browser support banner
    demos/
      tool-calling/
        ToolCallingDemo.tsx    # Main demo UI
        worker.ts              # Inference worker
        useLLM.ts              # Model loading/generation hook
        tools.ts               # Tool call parsing + execution
        db.ts                  # IndexedDB persistence
        constants.ts           # Models, prompts, default tools
      thinking/
        ThinkingDemo.tsx       # Main demo UI
        worker.ts              # Inference worker
        useLLM.ts              # Model loading/generation hook
        LiquidIntro.tsx        # Animated splash intro
      audio/
        AudioDemo.tsx          # Main demo UI (ASR/TTS/Interleaved)
        worker.ts              # Audio pipeline worker
  index.html
  vite.config.ts               # COOP/COEP headers for SharedArrayBuffer
  tsconfig.json
  package.json
```

## Key Configuration
- **COOP/COEP headers**: Required for SharedArrayBuffer (WebGPU/ONNX). Set in `vite.config.ts` server headers.
- **Worker format**: ES modules (`worker: { format: 'es' }`)
- **Port**: 5000 (webview)

## Running
- **Workflow**: "Start application" runs `cd web && npm run dev`
- **Port**: 5000
- **Requirements**: Chrome or Edge 113+ with WebGPU enabled

## Browser Support
- Chrome 113+ ✓
- Edge 113+ ✓
- Firefox: Not supported (no WebGPU)
- Safari: Partial (WebGPU experimental)
- Mobile: Not supported
