import { CoreMLLLM } from "@/modules/expo-coreml-llm";
import {
  CoreMLBridge,
  CoreMLGenerateOptions,
  CoreMLLoadModelOptions,
  DEFAULT_COREML_LOAD_OPTIONS,
  normalizeCoreMLError,
} from "@/utils/coreml";

export interface ICoreMLProvider {
  load(options?: CoreMLLoadModelOptions): Promise<void>;
  generate(prompt: string, options?: CoreMLGenerateOptions): Promise<string>;
  unload(): Promise<void>;
  cancel(): Promise<void>;
  isLoaded(): Promise<boolean>;
}

export class NativeCoreMLProvider implements ICoreMLProvider {
  constructor(
    private readonly bridge: CoreMLBridge = CoreMLLLM as CoreMLBridge,
  ) {}

  async load(
    options: CoreMLLoadModelOptions = DEFAULT_COREML_LOAD_OPTIONS,
  ): Promise<void> {
    try {
      const loaded = await this.bridge.isLoaded();
      if (!loaded) {
        await this.bridge.loadModel(options);
      }
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
