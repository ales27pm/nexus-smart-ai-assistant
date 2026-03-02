# CoreML Deployment and Lifecycle Runbook

This runbook is the authoritative protocol for managing CoreML model state, asset synchronization, and automated build pipelines. By enforcing these standards, we ensure architectural integrity and build determinism across local development environments and the EAS/GitHub Actions CI/CD infrastructure.

---

## 1. Architectural Foundation and Directory Topology

A standardized directory structure is the strategic bedrock for maintaining system integrity. In an ecosystem where native Swift modules, Python-based model conversion tools, and Expo-based mobile applications converge, a rigid topology prevents configuration drift and ensures that automated pipelines can predictably locate and validate assets.

### Functional Directory Roles

- `./scripts/coreml`: The core automation suite. It contains high-value utilities such as `hf_snapshot_download.py` for HuggingFace integration, `get_dolphin_coreml.sh` for weight acquisition, and `inspect_coreml_io.py` for model introspection.
- `./scripts/ios`: Manages the Apple ecosystem interface, housing `apple_developer_credentials.sh`, `sync_apple_credentials_fastlane.sh`, and `prebuild_with_pod_doctor.sh` to maintain environment stability.
- `./modules/expo-coreml-llm`: The native bridge implementation. It contains the Swift logic for execution (`CoreMLLLMRunner.swift`), tokenization (`GPT2Tokenizer.swift`), and resource resolution.
- `./utils`: The TypeScript abstraction layer. This includes `NativeCoreMLProvider`, which provides the high-level interface to the native module.

### Separation of Concerns

There is a deliberate architectural decoupling between the `expo-coreml-llm` native module and the `./scripts/coreml` automation suite. The native module (specifically `ResourceResolver.swift`) assumes that all assets are localized, valid, and correctly path-referenced before execution. This places the entire burden of "readiness" on the automation scripts. By separating the lifecycle (fetching, converting, validating) from the runtime (execution, sampling), we prevent the native codebase from being polluted by build-time logic, ensuring a lean and stable binary.

This structure provides the deterministic landscape required for our versioned manifest system.

---

## 2. Model Manifest Orchestration and Versioning

The `coreml-runtime-manifest.json` acts as the single source of truth for model state and app compatibility. Strategic management of this file ensures the application can orchestrate multiple model versions while safeguarding users against incompatible binary-model mismatches.

### Manifest Update Procedure

Updates are performed via `coreml_manifest.mjs`. When modifying the manifest, architects must enforce:

- `minimumAppSupportedSchemaVersion`: A critical stop-gap that prevents model-app mismatch errors. This ensures that a newer model requiring Swift-side changes (for example, a new sampling parameter) is not loaded by an older binary.
- `activeVersionId`: The primary pointer determining which version from the `versions` array is utilized by the current build.
- Source extraction: The `toModelDownloadConfig` logic extracts the first available URL from the `sources` array for each file, ensuring a deterministic download path from the manifest.

### Manifest Property Mapping (Runtime Impact)

As evidenced in `coremlUtils.test.ts`, manifest properties map directly to the `NativeCoreMLProvider` configuration:

| Manifest Property   | Functional Impact on Runtime                                                | Source/Test Reference           |
| ------------------- | --------------------------------------------------------------------------- | ------------------------------- |
| `modelRelativePath` | Determines the specific `.mlpackage` the bridge attempts to load.           | `modelManifest.test.ts`         |
| `contextLimit`      | Maps to `maxContext` in `DEFAULT_COREML_LOAD_OPTIONS`.                      | `coremlUtils.test.ts`           |
| `computeUnits`      | Configures the hardware target (for example, `cpuAndNeuralEngine`).         | `coremlProvider.test.ts`        |
| `stopTokenIds`      | Instructs the generator when to cease output to prevent runaway generation. | `dolphinCoremlGenerate.test.ts` |
| `eosTokenId`        | Defines the specific token signifying the end of string for the tokenizer.  | `coremlUtils.test.ts`           |

Once orchestrated, the physical assets must be synchronized to match the manifest definitions.

---

## 3. Asset Synchronization and Tokenizer Integration

> [!WARNING]
> **Asymmetric update risk:** Desynchronizing model weights and tokenizers leads to non-deterministic gibberish or runtime crashes. The mathematical weights must align perfectly with the linguistic mapping of the tokenizer assets.

### Execution Commands

To sync the environment, execute the following entry-point commands:

- Fetch CoreML weights: `bash ./scripts/coreml/fetch_dolphin_coreml_and_tokenizer.sh` (wraps `hf_snapshot_download.py` for secure HuggingFace snapshots).
- Export tokenizer assets: `python3 ./scripts/coreml/export_gpt2_bpe_assets.py`

### Tokenizer Configuration Logic

The system differentiates between `byte_level_bpe` and `gpt2_bpe` via `ResourceResolver.swift` and `GPT2Tokenizer.swift`. The specific asset names are critical:

- `byte_level_bpe`: Looks for standard naming conventions like `vocab.json` and `merges.txt` within `modules/expo-coreml-llm/ios/resources/tokenizers/byte_level_bpe/`.
- `gpt2_bpe`: Utilizes specialized naming (`gpt2-vocab.json`, for example) as seen in `dolphinCoremlGenerate.test.ts` to maintain compatibility with specific model architectures.

Following asset synchronization, move to environment validation to ensure build readiness.

---

## 4. Local Build Environment Validation Protocols

"Shift-left" validation identifies environment mismatches before they reach the CI pipeline, reducing feedback loops and preserving build credits.

### Developer Validation Checklist

1. Toolchain sanity: Run `./scripts/check-ios-local-build-env.sh` to verify Xcode, Node, and Ruby environment versions.
2. Asset integrity: Run `node ./scripts/coreml/validate_coreml_pipeline.mjs` to ensure every asset defined in the manifest exists on disk and passes checksums.
3. Credential parity: Run `node ./scripts/validate-ios-local-credentials.mjs` (located in root `./scripts`) to ensure local signing identities match EAS requirements.

### Stabilization via `prebuild_with_pod_doctor.sh`

This script is a prerequisite for the Expo prebuild phase. It audits the CocoaPods environment and Ruby gem versions to prevent Podfile lock drift common in iOS development. It specifically mitigates failures prior to the mandatory `pod install --repo-update` command used in CI pipelines.

---

## 5. CI/CD Pipeline and EAS Build Automation

Our `ios.yml` workflow enforces deterministic builds through a strict sequence of validation and compilation stages.

### Critical Pipeline Stages

1. JS dependency enforcement: Uses `npm ci` to ensure strict adherence to `package-lock.json`.
2. Hard-fail validation: Executes `npm run coreml:validate -- --strict`. Failure here halts the pipeline before expensive macOS runners are fully consumed.
3. CocoaPods clean install: Executes `rm -rf ios/Pods` followed by `pod install --repo-update` within the `ios` directory to ensure zero artifact persistence.
4. Scheme resolution: The pipeline uses a Ruby one-liner to parse `xcodebuild -list -json` output, identifying all available schemes for the workspace or project.

### Testable Scheme Resolution

The CI queries `xcodebuild -showTestPlans`. If a scheme has an associated test plan, the pipeline sets `CAN_RUN_TESTS=true` and prioritizes build-for-testing. If no test plan is discovered, it falls back to a standard build to verify compilation.

---

## 6. iOS Code-Signing Recovery and Troubleshooting

Maintaining local credential parity with EAS is the only way to avoid code-signing failures during local debugging.

### Recovery Suite Execution

If signing errors occur, execute the suite in this specific order:

1. `repair-ios-local-credentials.mjs`: Re-aligns the local keychain with EAS-stored credentials.
2. `fix_local_ios_signing.sh`: Forcibly flushes and resets local provisioning profiles.
3. `diagnose_p12.sh`: Inspects certificate integrity and expiration dates.

### CoreML Runtime Error Reference

The `NativeCoreMLProvider` maps native failures to actionable hints via `toActionableCoreMLError`.

| Code  | Error Type           | Actionable Hint                                           | Architectural Note                                                                           |
| ----- | -------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `10`  | Resource Error       | Generation failed; resource bundle missing.               | Referenced in `coremlUtils.test.ts`.                                                         |
| `20`  | State Error          | No CoreML model selected; load model first.               | Model not loaded in `CoreMLLLMRunner`.                                                       |
| `104` | Execution Plan Error | Execution-plan build failed.                              | The provider automatically retries generation with `computeUnits: "cpuOnly"` if this occurs. |
| `120` | Tokenizer Error      | Tokenizer mismatch; check `byte_level_bpe` vs `gpt2_bpe`. | Critical pathing error in `ResourceResolver`.                                                |

### Maintenance Cadence

- **Monthly**: Audit `coreml-runtime-manifest.json` against new hardware specifications.
- **Per release**: Synchronize `minimumAppSupportedSchemaVersion` with any changes to native `Types.swift` or `Sampling.swift` logic.
- **CI updates**: Update the Ruby-based scheme resolution logic if migrating to nested Xcode workspaces.
