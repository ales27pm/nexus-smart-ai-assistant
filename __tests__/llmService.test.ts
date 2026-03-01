import { CoreMLError } from "@/utils/coreml";
import { CoreMLLLMService } from "@/utils/llmService";

describe("CoreMLLLMService", () => {
  it("initializes and disposes through provider", async () => {
    const provider = {
      load: jest.fn().mockResolvedValue(undefined),
      generate: jest.fn(),
      unload: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn(),
      isLoaded: jest.fn().mockResolvedValue(true),
    };

    const service = new CoreMLLLMService(provider as any);

    await service.initialize();
    await service.dispose();

    expect(provider.load).toHaveBeenCalled();
    expect(provider.unload).toHaveBeenCalled();
  });

  it("generates cleaned response", async () => {
    const provider = {
      load: jest.fn(),
      generate: jest
        .fn()
        .mockResolvedValue("system\n\nUser: hello\nAssistant:  hi there"),
      unload: jest.fn(),
      cancel: jest.fn(),
      isLoaded: jest.fn(),
    };

    const service = new CoreMLLLMService(provider as any);
    await expect(service.generateChatResponse("system", "hello")).resolves.toBe(
      "hi there",
    );
  });

  it("cancels generation when signal is aborted", async () => {
    const provider = {
      load: jest.fn(),
      generate: jest.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return "system\n\nUser: hello\nAssistant: done";
      }),
      unload: jest.fn(),
      cancel: jest.fn().mockResolvedValue(undefined),
      isLoaded: jest.fn(),
    };

    const service = new CoreMLLLMService(provider as any);
    const controller = new AbortController();

    const resultPromise = service.generateChatResponse(
      "system",
      "hello",
      undefined,
      controller.signal,
    );

    controller.abort();
    await resultPromise;

    expect(provider.cancel).toHaveBeenCalled();
  });

  it("wraps readiness failures as CoreMLError", async () => {
    const provider = {
      load: jest.fn(),
      generate: jest.fn(),
      unload: jest.fn(),
      cancel: jest.fn(),
      isLoaded: jest.fn().mockRejectedValue(new Error("bridge missing")),
    };

    const service = new CoreMLLLMService(provider as any);

    await expect(service.isReady()).rejects.toBeInstanceOf(CoreMLError);
  });
});
