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

self.addEventListener("message", async (event: MessageEvent) => {
  const { type, payload } = event.data;

  if (type === "load") {
    if (!generator) {
      try {
        generator = await loadTextGenPipeline(
          "LiquidAI/LFM2.5-1.2B-Thinking-ONNX",
          {
            dtype: "q4f16",
            device: "webgpu",
            progress_callback: (progress: {
              status: string;
              progress?: number;
              file?: string;
            }) => {
              self.postMessage({ type: "progress", payload: progress });
            },
          },
        );
        self.postMessage({ type: "loaded" });
      } catch (err) {
        self.postMessage({ type: "error", payload: { message: String(err) } });
      }
    } else {
      self.postMessage({ type: "loaded" });
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
    const { messages } = payload;
    let fullOutput = "";

    const streamer = new TextStreamer(generator.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: false,
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
        max_new_tokens: 64000,
        do_sample: false,
        streamer,
      });
      self.postMessage({ type: "done", payload: { fullOutput } });
    } catch (err) {
      if (String(err).toLowerCase().includes("abort")) {
        self.postMessage({ type: "aborted" });
      } else {
        self.postMessage({ type: "error", payload: { message: String(err) } });
      }
    }
    return;
  }
});
