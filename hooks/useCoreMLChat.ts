import { useEffect, useState } from "react";
import { Platform } from "react-native";
import {
  buildCoreMLChatPrompt,
  cleanCoreMLOutput,
  DEFAULT_COREML_GENERATE_OPTIONS,
  DEFAULT_COREML_LOAD_OPTIONS,
  CoreMLBridge,
} from "@/utils/coreml";

export function useCoreMLChat() {
  const [coreML, setCoreML] = useState<CoreMLBridge | null>(null);

  useEffect(() => {
    if (Platform.OS !== "ios") return;

    import("@/modules/expo-coreml-llm")
      .then((mod: any) => {
        if (mod?.CoreMLLLM) setCoreML(mod.CoreMLLLM as CoreMLBridge);
      })
      .catch(() => setCoreML(null));
  }, []);

  const isAvailable = Platform.OS === "ios" && !!coreML;

  async function generate(systemPrompt: string, userText: string) {
    if (!coreML) {
      throw new Error(
        "CoreML module not linked. Do: npx expo prebuild --clean, then build/run a dev client on iOS.",
      );
    }

    const loaded = await coreML.isLoaded();
    if (!loaded) {
      await coreML.loadModel(DEFAULT_COREML_LOAD_OPTIONS);
    }

    const prompt = buildCoreMLChatPrompt(systemPrompt, userText);
    const rawOutput = await coreML.generate(
      prompt,
      DEFAULT_COREML_GENERATE_OPTIONS,
    );
    return cleanCoreMLOutput(rawOutput, prompt);
  }

  return { coreML, isAvailable, generate };
}
