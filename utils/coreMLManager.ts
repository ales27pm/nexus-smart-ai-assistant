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
import type { ModelAssetProgressEvent } from "@/utils/coremlModelManager";
import { ICoreMLProvider, NativeCoreMLProvider } from "@/utils/coremlProvider";

export type CoreMLInitializationEvent = ModelAssetProgressEvent;
export type CoreMLManagerState = "Idle" | "Loading" | "Ready" | "Disposing";

export type CoreMLManagerStateEvent = {
  previousState: CoreMLManagerState;
  state: CoreMLManagerState;
};

type CoreMLInitializationProgressCallback = (
  event: CoreMLInitializationEvent,
) => void;

type CoreMLManagerStateListener = (event: CoreMLManagerStateEvent) => void;

export class CoreMLManager {
  private provider: ICoreMLProvider;
  private busy = false;
  private state: CoreMLManagerState = "Idle";
  private transitionQueue: Promise<void> = Promise.resolve();
  private stateListeners = new Set<CoreMLManagerStateListener>();
  private currentOptions: CoreMLLoadModelOptions = {
    ...DEFAULT_COREML_LOAD_OPTIONS,
  };

  constructor(provider: ICoreMLProvider = new NativeCoreMLProvider()) {
    this.provider = provider;
  }

  async initialize(
    opts: CoreMLLoadModelOptions = {},
    onProgress?: CoreMLInitializationProgressCallback,
  ): Promise<void> {
    return this.queueTransition(async () => {
      await this.performInitialize(opts, onProgress);
    });
  }

  private async performInitialize(
    opts: CoreMLLoadModelOptions = {},
    onProgress?: CoreMLInitializationProgressCallback,
  ): Promise<void> {
    this.setState("Loading");

    try {
      let resolvedOpts: CoreMLLoadModelOptions = {
        ...DEFAULT_COREML_LOAD_OPTIONS,
        ...opts,
      };

      if (Platform.OS === "ios") {
        try {
          onProgress?.({
            stage: "preparing",
            message: "Preparing CoreML model assets",
            progress: 0.01,
          });
          const prepared = await ensureCoreMLModelAssets(onProgress);
          if (!prepared?.modelPath) {
            throw new CoreMLError(
              "CoreML model setup failed: downloaded assets are unavailable. Please check your network connection and free storage, then try again.",
            );
          }
          resolvedOpts = withPreferredCoreMLModelSource(
            resolvedOpts,
            prepared?.modelPath,
          );
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          console.error(
            "[CoreMLManager] model download/setup failed during initialization",
            error,
          );
          throw new CoreMLError(
            `CoreML model setup failed: unable to download or prepare model assets. Check connectivity and available storage, then retry. (${detail})`,
          );
        }
      }

      const isLoaded = await this.provider.isLoaded();
      if (isLoaded) {
        const oldKey = JSON.stringify(this.currentOptions);
        const newKey = JSON.stringify(resolvedOpts);
        if (oldKey === newKey) {
          this.setState("Ready");
          return;
        }
      }

      onProgress?.({
        stage: "activating",
        message: "Loading CoreML model into runtime",
        progress: 0.97,
      });
      await this.provider.load(resolvedOpts, { forceReload: true });
      this.currentOptions = { ...resolvedOpts };
      this.setState("Ready");
      onProgress?.({
        stage: "ready",
        message: "CoreML model loaded and ready",
        progress: 1,
      });
    } catch (error) {
      this.setState("Idle");
      throw error;
    }
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
    return this.queueTransition(async () => {
      this.setState("Disposing");
      await this.provider.unload();
      this.currentOptions = { ...DEFAULT_COREML_LOAD_OPTIONS };
      this.setState("Idle");
    });
  }

  async isReady(): Promise<boolean> {
    return this.provider.isLoaded();
  }

  getActiveComputeUnits(): CoreMLLoadModelOptions["computeUnits"] | null {
    return this.provider.getActiveComputeUnits();
  }

  getState(): CoreMLManagerState {
    return this.state;
  }

  onStateChange(listener: CoreMLManagerStateListener): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  private setState(state: CoreMLManagerState) {
    if (this.state === state) {
      return;
    }

    const previousState = this.state;
    this.state = state;

    this.stateListeners.forEach((listener) => {
      listener({ previousState, state });
    });
  }

  private queueTransition<T>(transition: () => Promise<T>): Promise<T> {
    const queued = this.transitionQueue.then(transition, transition);
    this.transitionQueue = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }
}

export const coreMLManager = new CoreMLManager();

export type {
  CoreMLError,
  CoreMLLoadModelOptions,
  CoreMLGenerateOptions,
} from "@/utils/coreml";
