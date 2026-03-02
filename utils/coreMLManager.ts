import { Platform } from "react-native";

import {
  CoreMLError,
  CoreMLGenerateOptions,
  CoreMLLoadModelOptions,
  DEFAULT_COREML_GENERATE_OPTIONS,
  DEFAULT_COREML_LOAD_OPTIONS,
  buildCoreMLChatPrompt,
  cleanCoreMLOutput,
  toActionableCoreMLError,
  withPreferredCoreMLModelSource,
} from "@/utils/coreml";
import { ensureCoreMLModelAssets } from "@/utils/coremlModelManager";
import { ICoreMLProvider, NativeCoreMLProvider } from "@/utils/coremlProvider";

export class CoreMLManager {
  private provider: ICoreMLProvider;
  private busy = false;
  private currentOptions: CoreMLLoadModelOptions = {
    ...DEFAULT_COREML_LOAD_OPTIONS,
  };

  constructor(provider: ICoreMLProvider = new NativeCoreMLProvider()) {
    this.provider = provider;
  }

  async initialize(opts: CoreMLLoadModelOptions = {}): Promise<void> {
    let resolvedOpts: CoreMLLoadModelOptions = {
      ...DEFAULT_COREML_LOAD_OPTIONS,
      ...opts,
    };

    if (Platform.OS === "ios") {
      try {
        const prepared = await ensureCoreMLModelAssets();
        resolvedOpts = withPreferredCoreMLModelSource(
          resolvedOpts,
          prepared?.modelPath,
        );
      } catch (error) {
        if (!__DEV__) {
          throw error;
        }

        console.warn(
          "[CoreMLManager] model asset preparation failed; falling back to bundled model in __DEV__",
          error,
        );
        resolvedOpts = withPreferredCoreMLModelSource(resolvedOpts, null);
      }
    }

    const isLoaded = await this.provider.isLoaded();
    if (isLoaded) {
      const oldKey = JSON.stringify(this.currentOptions);
      const newKey = JSON.stringify(resolvedOpts);
      if (oldKey === newKey) {
        return;
      }
    }

    await this.provider.load(resolvedOpts, { forceReload: true });
    this.currentOptions = { ...resolvedOpts };
  }

  async generate(
    systemPrompt: string,
    userText: string,
    options: CoreMLGenerateOptions = {},
    signal?: AbortSignal,
  ): Promise<string> {
    if (this.busy) {
      throw new CoreMLError(
        "CoreML generation already in progress. Please wait for the current request to finish.",
      );
    }

    const prompt = buildCoreMLChatPrompt(systemPrompt, userText);
    const opts: CoreMLGenerateOptions = {
      ...DEFAULT_COREML_GENERATE_OPTIONS,
      ...options,
    };
    this.busy = true;

    const abortHandler = () => {
      this.provider.cancel().catch((err) => {
        console.warn("[CoreMLManager] cancel failed", err);
      });
    };

    try {
      if (signal?.aborted) {
        abortHandler();
        throw new CoreMLError("Generation aborted before start", "ABORT_ERR");
      }

      signal?.addEventListener("abort", abortHandler, { once: true });
      const rawOutput = await this.provider.generate(prompt, opts);
      return cleanCoreMLOutput(rawOutput, prompt);
    } catch (error) {
      throw toActionableCoreMLError(error);
    } finally {
      signal?.removeEventListener("abort", abortHandler);
      this.busy = false;
    }
  }

  async cancel(): Promise<void> {
    await this.provider.cancel();
  }

  async dispose(): Promise<void> {
    await this.provider.unload();
    this.currentOptions = { ...DEFAULT_COREML_LOAD_OPTIONS };
  }

  async isReady(): Promise<boolean> {
    return this.provider.isLoaded();
  }
}

export const coreMLManager = new CoreMLManager();

export type {
  CoreMLError,
  CoreMLLoadModelOptions,
  CoreMLGenerateOptions,
} from "@/utils/coreml";
