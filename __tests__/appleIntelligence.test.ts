import {
  generateAppleIntelligenceText,
  generateBestOnDeviceText,
  generateExecutorchText,
  getAppleIntelligenceAvailability,
  getBestOnDeviceLLMBackend,
} from "@/utils/appleIntelligence";

describe("appleIntelligence", () => {
  it("returns moduleUnavailable when loader yields null", async () => {
    await expect(
      getAppleIntelligenceAvailability(async () => null),
    ).resolves.toBe("moduleUnavailable");
  });

  it("returns unavailable when availability check throws", async () => {
    const loader = async () => ({
      isFoundationModelsEnabled: jest
        .fn()
        .mockRejectedValue(new Error("bad bridge")),
      AppleLLMSession: class {
        configure = jest.fn();
        generateText = jest.fn();
        dispose = jest.fn();
      },
    });

    await expect(getAppleIntelligenceAvailability(loader)).resolves.toBe(
      "unavailable",
    );
  });

  it("generates text and disposes Apple Intelligence session", async () => {
    const configure = jest.fn().mockResolvedValue(true);
    const generateText = jest.fn().mockResolvedValue("hello world");
    const dispose = jest.fn();

    const loader = async () => ({
      isFoundationModelsEnabled: jest.fn().mockResolvedValue("available"),
      AppleLLMSession: class {
        configure = configure;
        generateText = generateText;
        dispose = dispose;
      },
    });

    await expect(
      generateAppleIntelligenceText("Say hello", "Be concise", loader),
    ).resolves.toBe("hello world");

    expect(configure).toHaveBeenCalledWith({ instructions: "Be concise" });
    expect(generateText).toHaveBeenCalledWith({ prompt: "Say hello" });
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("throws when Apple Intelligence availability is not ready", async () => {
    const dispose = jest.fn();

    const loader = async () => ({
      isFoundationModelsEnabled: jest
        .fn()
        .mockResolvedValue("appleIntelligenceNotEnabled"),
      AppleLLMSession: class {
        configure = jest.fn();
        generateText = jest.fn();
        dispose = dispose;
      },
    });

    await expect(
      generateAppleIntelligenceText("Say hello", undefined, loader),
    ).rejects.toThrow("Apple Intelligence unavailable");

    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("detects ExecuTorch as fallback backend", async () => {
    await expect(
      getBestOnDeviceLLMBackend({
        platform: "android",
        executorchLoader: async () => ({
          LLMController: class {
            load = jest.fn();
            configure = jest.fn();
            sendMessage = jest.fn();
            interrupt = jest.fn();
            delete = jest.fn();
          },
        }),
      }),
    ).resolves.toBe("executorch");
  });

  it("runs ExecuTorch generation and always cleans up controller", async () => {
    const load = jest.fn().mockResolvedValue(undefined);
    const configure = jest.fn();
    const sendMessage = jest.fn().mockResolvedValue("executorch response");
    const interrupt = jest.fn();
    const dispose = jest.fn();

    const loader = async () => ({
      LLMController: class {
        load = load;
        configure = configure;
        sendMessage = sendMessage;
        interrupt = interrupt;
        delete = dispose;
      },
    });

    await expect(
      generateExecutorchText(
        "diagnose wifi",
        {
          modelSource: "model.pte",
          tokenizerSource: "tokenizer.json",
          tokenizerConfigSource: "tokenizer_config.json",
          systemPrompt: "You are a network assistant.",
          contextWindowLength: 8,
          temperature: 0.2,
          topp: 0.9,
        },
        loader,
      ),
    ).resolves.toBe("executorch response");

    expect(load).toHaveBeenCalled();
    expect(configure).toHaveBeenCalledWith({
      chatConfig: {
        systemPrompt: "You are a network assistant.",
        contextWindowLength: 8,
      },
      generationConfig: {
        temperature: 0.2,
        topp: 0.9,
      },
    });
    expect(sendMessage).toHaveBeenCalledWith("diagnose wifi");
    expect(interrupt).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("routes generateBestOnDeviceText to ExecuTorch on Android", async () => {
    const sendMessage = jest.fn().mockResolvedValue("from executorch");

    await expect(
      generateBestOnDeviceText("hello", {
        platform: "android",
        executorch: {
          modelSource: "model.pte",
          tokenizerSource: "tokenizer.json",
          tokenizerConfigSource: "tokenizer_config.json",
        },
        executorchLoader: async () => ({
          LLMController: class {
            load = jest.fn().mockResolvedValue(undefined);
            configure = jest.fn();
            sendMessage = sendMessage;
            interrupt = jest.fn();
            delete = jest.fn();
          },
        }),
      }),
    ).resolves.toBe("from executorch");

    expect(sendMessage).toHaveBeenCalledWith("hello");
  });
});
