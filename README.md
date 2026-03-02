# Nexus Smart AI Assistant

Nexus is an Expo + React Native application with a custom CoreML native module for on-device LLM inference, speech interaction, and conversational memory. The repository includes runtime code, CoreML asset lifecycle tooling, and iOS credential/build automation for deterministic local and CI builds.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Repository Layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [CoreML Model Lifecycle](#coreml-model-lifecycle)
- [Development Workflows](#development-workflows)
- [Testing and Quality Gates](#testing-and-quality-gates)
- [iOS Build, Signing, and Distribution](#ios-build-signing-and-distribution)
- [Troubleshooting](#troubleshooting)
- [Additional Documentation](#additional-documentation)

## Architecture Overview

The app is designed around a layered runtime:

- **App/UI layer** (`app`, `components`, `hooks`, `providers`, `utils`) built with Expo Router and TypeScript.
- **Native inference bridge** (`modules/expo-coreml-llm`) that provides Swift-based CoreML loading, sampling, and tokenizer/resource resolution.
- **Model lifecycle automation** (`scripts/coreml`) that handles model download, tokenizer export, manifest processing, and pipeline validation.
- **Apple ecosystem automation** (`scripts/ios`) for credentials, signing diagnostics, and prebuild stabilization.

This separation keeps runtime inference code lean while moving asset readiness and build-time validation into deterministic scripts.

## Repository Layout

High-impact directories and files:

- `app/`: Expo Router screens and navigation layouts.
- `components/`: Shared presentational and interaction components.
- `utils/`: Runtime service and provider logic, including CoreML integration wrappers.
- `modules/expo-coreml-llm/`: Native Expo module (Swift + module config + tokenizer resources).
- `scripts/coreml/`: CoreML model and tokenizer lifecycle scripts.
- `scripts/ios/`: iOS credentials and signing helpers.
- `coreml-runtime-manifest.json`: Source-of-truth model runtime manifest.
- `docs/NEXUS_COGNITIVE_FRAMEWORK_ARCHITECTURE.md`: Cognitive architecture specification.
- `docs/COREML_DEPLOYMENT_LIFECYCLE_RUNBOOK.md`: CoreML deployment and lifecycle runbook.

## Prerequisites

Install the following before local development:

- **Node.js** (LTS recommended)
- **npm** (repo currently configured with npm lockfile)
- **Xcode + Command Line Tools** (for iOS/dev-client workflows)
- **CocoaPods** (for native iOS dependency management)
- **Ruby + fastlane** (required for local EAS iOS production builds)

Optional but commonly used:

- **Android Studio** (for Android emulator/device development)
- **Expo CLI tools via `npx`**

## Quick Start

```bash
# 1) Install dependencies
npm ci

# 2) Start Metro for development client
npm run start

# 3) Open specific targets if needed
npm run ios
npm run android
npm run start-web
```

For remote-device development builds, use tunnel mode:

```bash
npm run start-tunnel
```

## CoreML Model Lifecycle

Use the provided scripts rather than ad-hoc manual file operations.

### Fetch and Prepare Assets

```bash
# Download configured CoreML weights/tokenizer artifacts
npm run coreml:fetch

# Validate manifest-declared assets/checksums
npm run coreml:validate

# Inspect model I/O metadata
npm run coreml:inspect
```

### Manifest Governance

`coreml-runtime-manifest.json` controls runtime model compatibility and active model selection. Keep these fields accurate when shipping model updates:

- `minimumAppSupportedSchemaVersion`
- `activeVersionId`
- `versions[*].files[*].sources`

For full operational policy and update discipline, follow the runbook in `docs/COREML_DEPLOYMENT_LIFECYCLE_RUNBOOK.md`.

## Development Workflows

### Local App Development

```bash
npm run start
```

### Native iOS Stabilization Before Prebuild

```bash
npm run ios:prebuild:doctor
npm run sync:ios-runtime-config
```

### Credential Validation

```bash
npm run check:ios:credentials
```

## Testing and Quality Gates

Run these before opening a PR:

```bash
npm run lint
npm test -- --runInBand
```

CoreML pipeline checks (recommended for any model/manifest/script change):

```bash
npm run coreml:validate -- --strict
```

## iOS Build, Signing, and Distribution

### Local Production Build (EAS Local)

```bash
npm run build:prod:ios:local
```

If cache/credential issues occur:

```bash
npm run build:prod:ios:local:clean
npm run build:prod:ios:local:repair
```

### Submit IPA Without EAS Submit

```bash
npm run submit:prod:ios:no-eas -- \
  --ipa /path/to/app.ipa \
  --apple-id you@example.com \
  --app-password xxxx-xxxx-xxxx-xxxx
```

## Troubleshooting

- Run `./scripts/check-ios-local-build-env.sh` to confirm local toolchain readiness.
- Run `npm run check:ios:credentials` and, if needed, `node ./scripts/repair-ios-local-credentials.mjs`.
- Use `./scripts/ios/fix_local_ios_signing.sh` followed by `./scripts/ios/diagnose_p12.sh` for signing recovery.
- If CoreML generation fails due to tokenizer or bundle issues, re-run `npm run coreml:fetch` and `npm run coreml:validate`.

## Additional Documentation

- NEXUS cognitive architecture: [`docs/NEXUS_COGNITIVE_FRAMEWORK_ARCHITECTURE.md`](docs/NEXUS_COGNITIVE_FRAMEWORK_ARCHITECTURE.md)
- CoreML deployment/lifecycle runbook: [`docs/COREML_DEPLOYMENT_LIFECYCLE_RUNBOOK.md`](docs/COREML_DEPLOYMENT_LIFECYCLE_RUNBOOK.md)
