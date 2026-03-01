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
    await this.provider.load(options);
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
      throw new CoreMLError(
        error instanceof Error
          ? error.message
          : "Failed to resolve CoreML readiness.",
      );
    }
  }
}
