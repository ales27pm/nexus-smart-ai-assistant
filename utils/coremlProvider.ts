import { CoreMLLLM } from "@/modules/expo-coreml-llm";
import {
  CoreMLBridge,
  CoreMLError,
  CoreMLGenerateOptions,
  CoreMLLoadModelOptions,
  DEFAULT_COREML_LOAD_OPTIONS,
  normalizeCoreMLError,
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
  return {
    modelFile: options.modelFile ?? "",
    modelName: options.modelName ?? "",
    modelPath: options.modelPath ?? "",
    inputIdsName: options.inputIdsName ?? "input_ids",
    attentionMaskName: options.attentionMaskName ?? "attention_mask",
    cachePositionName: options.cachePositionName ?? "cache_position",
    logitsName: options.logitsName ?? "logits",
    computeUnits: options.computeUnits ?? "all",
    eosTokenId: options.eosTokenId ?? -1,
    maxContext: options.maxContext ?? -1,
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
          await this.bridge.unloadModel();
          await this.bridge.loadModel(options);
          this.activeLoadOptions = { ...options };
          return;
        }

        this.activeLoadOptions = { ...currentOptions };
        return;
      }

      await this.bridge.loadModel(options);
      this.activeLoadOptions = { ...options };
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
      throw normalizeCoreMLError(error);
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
}
