import {
  CoreMLError,
  CoreMLGenerateOptions,
  CoreMLLoadModelOptions,
  DEFAULT_COREML_GENERATE_OPTIONS,
  DEFAULT_COREML_LOAD_OPTIONS,
  buildCoreMLChatPrompt,
  cleanCoreMLOutput,
  toActionableCoreMLError,
} from "@/utils/coreml";
import { ICoreMLProvider, NativeCoreMLProvider } from "@/utils/coremlProvider";
import { ensureCoreMLModelAssets } from "@/utils/coremlModelManager";
import { Platform } from "react-native";

export interface ILLMService {
  initialize(options?: CoreMLLoadModelOptions): Promise<void>;
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
  ): Promise<void> {
    const resolvedOptions: CoreMLLoadModelOptions = { ...options };

    if (Platform.OS === "ios") {
      const startedAt = Date.now();
      try {
        const prepared = await ensureCoreMLModelAssets();
        if (prepared?.modelPath) {
          resolvedOptions.modelPath = prepared.modelPath;
          if (!__DEV__) {
            delete resolvedOptions.modelFile;
          }
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
          throw error;
        }
        console.warn(
          "[CoreMLLLMService] continuing with bundled model fallback in __DEV__",
        );
      }
    }

    await this.provider.load(resolvedOptions);
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
