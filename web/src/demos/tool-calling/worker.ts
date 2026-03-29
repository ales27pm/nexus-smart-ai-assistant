import {
  TextStreamer,
  env,
  type TextGenerationPipeline,
} from "@huggingface/transformers";

env.allowLocalModels = false;
env.allowRemoteModels = true;

async function loadTextGenPipeline(
  modelId: string,
  opts: Record<string, unknown>,
): Promise<TextGenerationPipeline> {
  const { pipeline } = await import("@huggingface/transformers");
  return pipeline(
    "text-generation",
    modelId,
    opts as Parameters<typeof pipeline>[2],
  ) as unknown as TextGenerationPipeline;
}

let generator: TextGenerationPipeline | null = null;
let currentModelId = "";

self.addEventListener("message", async (event: MessageEvent) => {
  const { type, payload } = event.data;

  if (type === "load") {
    const { modelId } = payload;
    if (currentModelId !== modelId) {
      generator = null;
      currentModelId = "";
    }
    if (!generator) {
      try {
        generator = await loadTextGenPipeline(modelId, {
          dtype: "q4f16",
          device: "webgpu",
          progress_callback: (progress: {
            status: string;
            progress?: number;
            file?: string;
          }) => {
            self.postMessage({ type: "progress", payload: progress });
          },
        });
        currentModelId = modelId;
        self.postMessage({ type: "loaded", payload: { modelId } });
      } catch (err) {
        self.postMessage({ type: "error", payload: { message: String(err) } });
      }
    } else {
      self.postMessage({ type: "loaded", payload: { modelId } });
    }
    return;
  }

  if (type === "generate") {
    if (!generator) {
      self.postMessage({
        type: "error",
        payload: { message: "Model not loaded" },
      });
      return;
    }

    const { messages, maxNewTokens } = payload;
    let fullOutput = "";

    const streamer = new TextStreamer(generator.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (text: string) => {
        fullOutput += text;
        self.postMessage({
          type: "token",
          payload: { token: text, fullOutput },
        });
      },
    });

    try {
      await generator(messages, {
        max_new_tokens: maxNewTokens ?? 512,
        do_sample: false,
        streamer,
      });
      self.postMessage({ type: "done", payload: { fullOutput } });
    } catch (err) {
      const msg = String(err);
      if (msg.includes("AbortError") || msg.toLowerCase().includes("abort")) {
        self.postMessage({ type: "aborted" });
      } else {
        self.postMessage({ type: "error", payload: { message: msg } });
      }
    }
    return;
  }
});
