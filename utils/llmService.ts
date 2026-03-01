import {
  CoreMLError,
  CoreMLGenerateOptions,
  CoreMLLoadModelOptions,
  CoreMLLoadUxState,
  DEFAULT_COREML_GENERATE_OPTIONS,
  DEFAULT_COREML_LOAD_OPTIONS,
  buildCoreMLChatPrompt,
  cleanCoreMLOutput,
  toActionableCoreMLError,
  withPreferredCoreMLModelSource,
} from "@/utils/coreml";
import { ICoreMLProvider, NativeCoreMLProvider } from "@/utils/coremlProvider";
import { ensureCoreMLModelAssets } from "@/utils/coremlModelManager";
import { Platform } from "react-native";

export type CoreMLLoadStatusEvent = {
  state: CoreMLLoadUxState;
  detail?: string;
};

export interface ILLMService {
  initialize(
    options?: CoreMLLoadModelOptions,
    onLoadStatus?: (event: CoreMLLoadStatusEvent) => void,
  ): Promise<void>;
  generateChatResponse(
    systemPrompt: string,
    userText: string,
    options?: CoreMLGenerateOptions,
    signal?: AbortSignal,
  ): Promise<string>;
  dispose(): Promise<void>;
  isReady(): Promise<boolean>;
}

export class CoreMLLLMService implements ILLMService {
  constructor(
    private readonly provider: ICoreMLProvider = new NativeCoreMLProvider(),
  ) {}

  async initialize(
    options: CoreMLLoadModelOptions = DEFAULT_COREML_LOAD_OPTIONS,
    onLoadStatus?: (event: CoreMLLoadStatusEvent) => void,
  ): Promise<void> {
    let resolvedOptions: CoreMLLoadModelOptions = { ...options };

    if (Platform.OS === "ios") {
      const startedAt = Date.now();
      const emitLoadState = (state: CoreMLLoadUxState, detail?: string) => {
        onLoadStatus?.({ state, detail });
      };

      try {
        emitLoadState("downloading model");
        const prepared = await ensureCoreMLModelAssets();
        emitLoadState("verifying model");

        resolvedOptions = withPreferredCoreMLModelSource(
          resolvedOptions,
          prepared?.modelPath,
        );

        if (prepared?.modelPath) {
          console.info("[CoreMLLLMService] using downloaded model path", {
            modelPath: prepared.modelPath,
            downloadDurationMs: prepared.telemetry?.durationMs,
            downloaded: prepared.downloaded,
          });
        }
      } catch (error) {
        console.error("[CoreMLLLMService] model asset preparation failed", {
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        });

        if (!__DEV__) {
          emitLoadState(
            "failed—retry",
            error instanceof Error ? error.message : String(error),
          );
          throw error;
        }

        resolvedOptions = withPreferredCoreMLModelSource(resolvedOptions, null);
        console.warn(
          "[CoreMLLLMService] continuing with bundled model fallback in __DEV__",
        );
      }
    }

    try {
      await this.provider.load(resolvedOptions);
      onLoadStatus?.({ state: "ready" });
    } catch (error) {
      onLoadStatus?.({
        state: "failed—retry",
        detail: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async generateChatResponse(
    systemPrompt: string,
    userText: string,
    options: CoreMLGenerateOptions = DEFAULT_COREML_GENERATE_OPTIONS,
    signal?: AbortSignal,
  ): Promise<string> {
    const prompt = buildCoreMLChatPrompt(systemPrompt, userText);

    const abortHandler = () => {
      this.provider.cancel().catch((error) => {
        console.warn("[CoreMLLLMService] cancel failed", error);
      });
    };

    if (signal?.aborted) {
      abortHandler();
      throw new CoreMLError("Generation aborted before start", "ABORT_ERR");
    }

    signal?.addEventListener("abort", abortHandler, { once: true });

    try {
      const rawOutput = await this.provider.generate(prompt, options);
      return cleanCoreMLOutput(rawOutput, prompt);
    } catch (error) {
      throw toActionableCoreMLError(error);
    } finally {
      signal?.removeEventListener("abort", abortHandler);
    }
  }

  async dispose(): Promise<void> {
    await this.provider.unload();
  }

  async isReady(): Promise<boolean> {
    try {
      return await this.provider.isLoaded();
    } catch (error) {
      if (error instanceof CoreMLError) {
        throw error;
      }

      throw new CoreMLError(
        error instanceof Error
          ? error.message
          : "Failed to resolve CoreML readiness.",
      );
    }
  }
}
