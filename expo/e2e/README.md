# iOS E2E (Detox)

This package contains end-to-end tests that exercise the real CoreML native module via the `useCoreMLChat` hook and the `app/(tabs)/e2e.tsx` screen.

## Scenarios

- CoreML model load + generate success path.
- Compute-unit fallback path (`cpuAndNeuralEngine` retrying on `cpuOnly`).
- Cancellation while generation is active.

## Run locally

```bash
npm run e2e:ios:build
npm run e2e:ios:test
```

> Note: E2E requires macOS, Xcode simulator tooling, and a generated `ios/` directory.
