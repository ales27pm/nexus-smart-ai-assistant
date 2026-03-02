declare module "react-native-apple-llm" {
  export type FoundationModelsAvailability =
    | "available"
    | "appleIntelligenceNotEnabled"
    | "modelNotReady"
    | "unavailable";

  export class AppleLLMSession {
    configure(options: { instructions?: string }): Promise<boolean>;
    generateText(options: { prompt: string }): Promise<string>;
    dispose(): void;
  }

  export function isFoundationModelsEnabled(): Promise<FoundationModelsAvailability>;
}

declare module "react-native-executorch" {
  export type ResourceSource = string | number | object;

  export class LLMController {
    constructor(options?: {
      tokenCallback?: (token: string) => void;
      isReadyCallback?: (isReady: boolean) => void;
      isGeneratingCallback?: (isGenerating: boolean) => void;
    });

    load(options: {
      modelSource: ResourceSource;
      tokenizerSource: ResourceSource;
      tokenizerConfigSource: ResourceSource;
      onDownloadProgressCallback?: (downloadProgress: number) => void;
    }): Promise<void>;

    configure(options: {
      chatConfig?: {
        systemPrompt?: string;
        contextWindowLength?: number;
      };
      generationConfig?: {
        temperature?: number;
        topp?: number;
      };
    }): void;

    sendMessage(message: string): Promise<string>;
    interrupt(): void;
    delete(): void;
  }
}
