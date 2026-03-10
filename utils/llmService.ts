import {
  CoreMLError,
  CoreMLGenerateOptions,
  CoreMLLoadModelOptions,
  CoreMLLoadUxState,
  COREML_ERROR_ABORT,
  DEFAULT_COREML_GENERATE_OPTIONS,
  DEFAULT_COREML_LOAD_OPTIONS,
  buildCoreMLChatPrompt,
  cleanCoreMLOutput,
  toActionableCoreMLError,
  withPreparedCoreMLModelPath,
} from "@/utils/coreml";
import { ICoreMLProvider, NativeCoreMLProvider } from "@/utils/coremlProvider";
import { ensureCoreMLModelAssets } from "@/utils/coremlModelManager";
import { generateCoreMLTextStream } from "@/utils/coremlStreamingGenerator";
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
  generateChatResponseStream(
    systemPrompt: string,
    userText: string,
    onToken: (token: string) => void,
    options?: CoreMLGenerateOptions & { maxContext?: number },
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
        if (!prepared?.modelPath) {
          throw new CoreMLError(
            "CoreML model setup failed: downloaded assets are unavailable. Please check your network connection and free storage, then try again.",
          );
        }
        emitLoadState("verifying model");

        resolvedOptions = withPreparedCoreMLModelPath(
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

        const detail = error instanceof Error ? error.message : String(error);
        emitLoadState(
          "failed—retry",
          `Model download/setup failed. Check connectivity and available storage, then retry. (${detail})`,
        );
        throw new CoreMLError(
          `CoreML model setup failed: unable to download or prepare model assets. Check connectivity and available storage, then retry. (${detail})`,
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
    const rawOutput = await this.runWithAbort(signal, () =>
      this.provider.generate(prompt, options),
    );
    return cleanCoreMLOutput(rawOutput, prompt);
  }

  async generateChatResponseStream(
    systemPrompt: string,
    userText: string,
    onToken: (token: string) => void,
    options: CoreMLGenerateOptions & {
      maxContext?: number;
    } = DEFAULT_COREML_GENERATE_OPTIONS,
    signal?: AbortSignal,
  ): Promise<string> {
    const prompt = buildCoreMLChatPrompt(systemPrompt, userText);

    const rawOutput = await this.runWithAbort(signal, () =>
      generateCoreMLTextStream(this.provider, prompt, options, onToken),
    );
    return cleanCoreMLOutput(rawOutput, prompt);
  }

  private async runWithAbort<T>(
    signal: AbortSignal | undefined,
    operation: () => Promise<T>,
  ): Promise<T> {
    const abortHandler = () => {
      this.provider.cancel().catch((error) => {
        console.warn("[CoreMLLLMService] cancel failed", error);
      });
    };

    if (signal?.aborted) {
      abortHandler();
      throw new CoreMLError(
        "Generation aborted before start",
        COREML_ERROR_ABORT,
      );
    }

    signal?.addEventListener("abort", abortHandler, { once: true });

    try {
      return await operation();
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
