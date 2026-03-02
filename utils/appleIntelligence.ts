import { Platform } from "react-native";

export type FoundationModelsAvailability =
  | "available"
  | "appleIntelligenceNotEnabled"
  | "modelNotReady"
  | "unavailable";

export type AppleLLMModule = {
  isFoundationModelsEnabled: () => Promise<FoundationModelsAvailability>;
  AppleLLMSession: new () => {
    configure(options: { instructions?: string }): Promise<boolean>;
    generateText(options: { prompt: string }): Promise<string>;
    dispose(): void;
  };
};

type ExecutorchResourceSource = string | number | object;

type ExecutorchModule = {
  LLMController: new (args?: {
    tokenCallback?: (token: string) => void;
    isReadyCallback?: (isReady: boolean) => void;
    isGeneratingCallback?: (isGenerating: boolean) => void;
  }) => {
    load(args: {
      modelSource: ExecutorchResourceSource;
      tokenizerSource: ExecutorchResourceSource;
      tokenizerConfigSource: ExecutorchResourceSource;
      onDownloadProgressCallback?: (downloadProgress: number) => void;
    }): Promise<void>;
    configure(args: {
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
  };
};

export type OnDeviceLLMBackend =
  | "apple-intelligence"
  | "executorch"
  | "unavailable";

export type ExecutorchGenerationOptions = {
  modelSource: ExecutorchResourceSource;
  tokenizerSource: ExecutorchResourceSource;
  tokenizerConfigSource: ExecutorchResourceSource;
  systemPrompt?: string;
  contextWindowLength?: number;
  temperature?: number;
  topp?: number;
  onDownloadProgressCallback?: (progress: number) => void;
  onToken?: (token: string) => void;
};

async function loadAppleLLMModule(): Promise<AppleLLMModule | null> {
  try {
    const module = (await import("react-native-apple-llm")) as AppleLLMModule;
    return module;
  } catch (error) {
    console.warn(
      "[appleIntelligence] react-native-apple-llm is unavailable; falling back to alternative providers.",
      error,
    );
    return null;
  }
}

async function loadExecutorchModule(): Promise<ExecutorchModule | null> {
  try {
    const module =
      (await import("react-native-executorch")) as ExecutorchModule;
    return module;
  } catch (error) {
    console.warn(
      "[appleIntelligence] react-native-executorch is unavailable; on-device fallback disabled.",
      error,
    );
    return null;
  }
}

export async function getAppleIntelligenceAvailability(
  loader: () => Promise<AppleLLMModule | null> = loadAppleLLMModule,
): Promise<FoundationModelsAvailability | "moduleUnavailable"> {
  const module = await loader();
  if (!module) {
    return "moduleUnavailable";
  }

  try {
    return await module.isFoundationModelsEnabled();
  } catch (error) {
    console.error(
      "[appleIntelligence] failed to query Apple Intelligence availability",
      error,
    );
    return "unavailable";
  }
}

export async function getBestOnDeviceLLMBackend({
  appleLoader = loadAppleLLMModule,
  executorchLoader = loadExecutorchModule,
  platform = Platform.OS,
}: {
  appleLoader?: () => Promise<AppleLLMModule | null>;
  executorchLoader?: () => Promise<ExecutorchModule | null>;
  platform?: string;
} = {}): Promise<OnDeviceLLMBackend> {
  if (platform === "ios") {
    const availability = await getAppleIntelligenceAvailability(appleLoader);
    if (availability === "available") {
      return "apple-intelligence";
    }
  }

  const executorch = await executorchLoader();
  if (executorch) {
    return "executorch";
  }

  return "unavailable";
}

export async function generateAppleIntelligenceText(
  prompt: string,
  instructions = "You are a helpful assistant.",
  loader: () => Promise<AppleLLMModule | null> = loadAppleLLMModule,
): Promise<string> {
  const module = await loader();
  if (!module) {
    throw new Error(
      "react-native-apple-llm is not installed. Install it to use Apple Intelligence generation.",
    );
  }

  const session = new module.AppleLLMSession();

  try {
    const status = await module.isFoundationModelsEnabled();
    if (status !== "available") {
      throw new Error(`Apple Intelligence unavailable: ${status}`);
    }

    await session.configure({ instructions });
    return await session.generateText({ prompt });
  } catch (error) {
    console.error("[appleIntelligence] generation failed", error);
    throw error;
  } finally {
    session.dispose();
  }
}

export async function generateExecutorchText(
  prompt: string,
  options: ExecutorchGenerationOptions,
  loader: () => Promise<ExecutorchModule | null> = loadExecutorchModule,
): Promise<string> {
  const module = await loader();

  if (!module) {
    throw new Error(
      "react-native-executorch is not installed. Install it to use ExecuTorch generation.",
    );
  }

  const controller = new module.LLMController({
    tokenCallback: options.onToken,
  });

  try {
    await controller.load({
      modelSource: options.modelSource,
      tokenizerSource: options.tokenizerSource,
      tokenizerConfigSource: options.tokenizerConfigSource,
      onDownloadProgressCallback: options.onDownloadProgressCallback,
    });

    controller.configure({
      chatConfig: {
        systemPrompt: options.systemPrompt,
        contextWindowLength: options.contextWindowLength,
      },
      generationConfig: {
        temperature: options.temperature,
        topp: options.topp,
      },
    });

    return await controller.sendMessage(prompt);
  } catch (error) {
    console.error("[appleIntelligence] ExecuTorch generation failed", error);
    throw error;
  } finally {
    try {
      controller.interrupt();
    } catch (error) {
      console.warn("[appleIntelligence] ExecuTorch interrupt failed", error);
    }
    controller.delete();
  }
}

export async function generateBestOnDeviceText(
  prompt: string,
  options: {
    appleInstructions?: string;
    executorch?: ExecutorchGenerationOptions;
    appleLoader?: () => Promise<AppleLLMModule | null>;
    executorchLoader?: () => Promise<ExecutorchModule | null>;
    platform?: string;
  },
): Promise<string> {
  const backend = await getBestOnDeviceLLMBackend({
    appleLoader: options.appleLoader,
    executorchLoader: options.executorchLoader,
    platform: options.platform,
  });

  if (backend === "apple-intelligence") {
    return generateAppleIntelligenceText(
      prompt,
      options.appleInstructions,
      options.appleLoader,
    );
  }

  if (backend === "executorch" && options.executorch) {
    return generateExecutorchText(
      prompt,
      options.executorch,
      options.executorchLoader,
    );
  }

  throw new Error(
    "No on-device LLM backend is available. Install react-native-apple-llm (iOS) or react-native-executorch (iOS/Android).",
  );
}
