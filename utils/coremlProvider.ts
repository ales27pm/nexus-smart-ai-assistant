import { CoreMLLLM } from "@/modules/expo-coreml-llm";
import {
  CoreMLBridge,
  CoreMLError,
  CoreMLGenerateOptions,
  CoreMLLoadModelOptions,
  DEFAULT_COREML_LOAD_OPTIONS,
  isComputeUnitError,
  normalizeCoreMLError,
  requireCoreMLModelPath,
} from "@/utils/coreml";

export type CoreMLLoadControl = {
  forceReload?: boolean;
};

export interface ICoreMLProvider {
  load(
    options?: CoreMLLoadModelOptions,
    control?: CoreMLLoadControl,
  ): Promise<void>;
  generate(prompt: string, options?: CoreMLGenerateOptions): Promise<string>;
  unload(): Promise<void>;
  cancel(): Promise<void>;
  isLoaded(): Promise<boolean>;
  getActiveComputeUnits(): CoreMLLoadModelOptions["computeUnits"] | null;
}

function normalizeLoadOptions(
  options: CoreMLLoadModelOptions,
): Required<
  Pick<
    CoreMLLoadModelOptions,
    | "modelFile"
    | "modelName"
    | "modelPath"
    | "inputIdsName"
    | "attentionMaskName"
    | "cachePositionName"
    | "logitsName"
    | "computeUnits"
    | "eosTokenId"
    | "maxContext"
  >
> {
  const mergedOptions: CoreMLLoadModelOptions = {
    ...DEFAULT_COREML_LOAD_OPTIONS,
    ...options,
  };

  return {
    modelFile: mergedOptions.modelFile ?? "",
    modelName: mergedOptions.modelName ?? "",
    modelPath: mergedOptions.modelPath ?? "",
    inputIdsName: mergedOptions.inputIdsName ?? "input_ids",
    attentionMaskName: mergedOptions.attentionMaskName ?? "attention_mask",
    cachePositionName: mergedOptions.cachePositionName ?? "cache_position",
    logitsName: mergedOptions.logitsName ?? "logits",
    computeUnits: mergedOptions.computeUnits ?? "all",
    eosTokenId: mergedOptions.eosTokenId ?? -1,
    maxContext: mergedOptions.maxContext ?? -1,
  };
}

function hasSameLoadOptions(
  left: CoreMLLoadModelOptions,
  right: CoreMLLoadModelOptions,
): boolean {
  const a = normalizeLoadOptions(left);
  const b = normalizeLoadOptions(right);
  return (
    a.modelFile === b.modelFile &&
    a.modelName === b.modelName &&
    a.modelPath === b.modelPath &&
    a.inputIdsName === b.inputIdsName &&
    a.attentionMaskName === b.attentionMaskName &&
    a.cachePositionName === b.cachePositionName &&
    a.logitsName === b.logitsName &&
    a.computeUnits === b.computeUnits &&
    a.eosTokenId === b.eosTokenId &&
    a.maxContext === b.maxContext
  );
}

export class NativeCoreMLProvider implements ICoreMLProvider {
  private activeLoadOptions: CoreMLLoadModelOptions | null = null;

  constructor(
    private readonly bridge: CoreMLBridge = CoreMLLLM as CoreMLBridge,
  ) {}

  async load(
    options: CoreMLLoadModelOptions = DEFAULT_COREML_LOAD_OPTIONS,
    control: CoreMLLoadControl = {},
  ): Promise<void> {
    try {
      const loaded = await this.bridge.isLoaded();
      const forceReload = control.forceReload === true;

      if (loaded) {
        const currentOptions =
          this.activeLoadOptions ?? DEFAULT_COREML_LOAD_OPTIONS;
        if (!hasSameLoadOptions(currentOptions, options)) {
          if (!forceReload) {
            throw new CoreMLError(
              "CoreML model already loaded with different options. Pass { forceReload: true } to reload with new options.",
            );
          }
          const resolvedOptions = requireCoreMLModelPath(options);
          await this.bridge.unloadModel();
          await this.bridge.loadModel(resolvedOptions);
          this.activeLoadOptions = { ...resolvedOptions };
          return;
        }

        this.activeLoadOptions = { ...currentOptions };
        return;
      }

      const resolvedOptions = requireCoreMLModelPath(options);
      await this.bridge.loadModel(resolvedOptions);
      this.activeLoadOptions = { ...resolvedOptions };
    } catch (error) {
      throw normalizeCoreMLError(error);
    }
  }

  async generate(
    prompt: string,
    options?: CoreMLGenerateOptions,
  ): Promise<string> {
    try {
      return await this.bridge.generate(prompt, options);
    } catch (error) {
      const normalizedError = normalizeCoreMLError(error);
      const activeComputeUnits =
        this.activeLoadOptions?.computeUnits ??
        DEFAULT_COREML_LOAD_OPTIONS.computeUnits;
      const shouldRetryWithCpuOnly =
        isComputeUnitError(error) && activeComputeUnits !== "cpuOnly";

      if (!shouldRetryWithCpuOnly) {
        throw normalizedError;
      }

      const fallbackOptions: CoreMLLoadModelOptions = {
        ...(this.activeLoadOptions ?? DEFAULT_COREML_LOAD_OPTIONS),
        computeUnits: "cpuOnly",
      };

      await this.load(fallbackOptions, { forceReload: true });
      try {
        return await this.bridge.generate(prompt, options);
      } catch (fallbackError) {
        throw normalizeCoreMLError(fallbackError);
      }
    }
  }

  async unload(): Promise<void> {
    try {
      await this.bridge.unloadModel();
      this.activeLoadOptions = null;
    } catch (error) {
      throw normalizeCoreMLError(error);
    }
  }

  async cancel(): Promise<void> {
    try {
      await this.bridge.cancel();
    } catch (error) {
      throw normalizeCoreMLError(error);
    }
  }

  async isLoaded(): Promise<boolean> {
    try {
      return await this.bridge.isLoaded();
    } catch (error) {
      throw normalizeCoreMLError(error);
    }
  }

  getActiveComputeUnits(): CoreMLLoadModelOptions["computeUnits"] | null {
    return this.activeLoadOptions?.computeUnits ?? null;
  }
}
