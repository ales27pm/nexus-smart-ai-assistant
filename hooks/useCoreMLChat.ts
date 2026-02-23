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
  const [isAvailable, setIsAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (Platform.OS !== "ios") return;

      try {
        const mod: any = await import("@/modules/expo-coreml-llm");
        if (!mod?.CoreMLLLM) {
          if (!cancelled) {
            setCoreML(null);
            setIsAvailable(false);
          }
          return;
        }

        // IMPORTANT: call a native method to prove the native module is linked.
        // If native module isn't linked, this will throw.
        const bridge = mod.CoreMLLLM as CoreMLBridge;
        await bridge.isLoaded();

        if (!cancelled) {
          setCoreML(bridge);
          setIsAvailable(true);
        }
      } catch {
        if (!cancelled) {
          setCoreML(null);
          setIsAvailable(false);
        }
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  async function generate(systemPrompt: string, userText: string) {
    if (!coreML) {
      throw new Error(
        "CoreML module not linked. Do: npm i, then npx expo prebuild --clean, pod install, and build/run an iOS dev client containing this native module.",
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
