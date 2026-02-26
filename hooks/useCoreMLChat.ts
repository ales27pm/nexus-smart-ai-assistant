import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  CoreMLError,
  buildCoreMLChatPrompt,
  cleanCoreMLOutput,
  DEFAULT_COREML_GENERATE_OPTIONS,
  toActionableCoreMLError,
} from "@/utils/coreml";
import { ICoreMLProvider, NativeCoreMLProvider } from "@/utils/coremlProvider";

export function useCoreMLChat() {
  const [provider, setProvider] = useState<ICoreMLProvider | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);
  const providerRef = useRef<ICoreMLProvider | null>(null);
  const isGeneratingRef = useRef(false);

  useEffect(() => {
    let disposed = false;

    async function boot() {
      if (Platform.OS !== "ios") return;

      try {
        const instance = new NativeCoreMLProvider();
        await instance.load();

        if (!disposed) {
          providerRef.current = instance;
          setProvider(instance);
          setIsAvailable(true);
        } else {
          await instance.unload();
        }
      } catch (error) {
        console.error("[CoreML] boot failed", error);
        if (!disposed) {
          providerRef.current = null;
          setProvider(null);
          setIsAvailable(false);
        }
      }
    }

    boot();

    return () => {
      disposed = true;
      const latestProvider = providerRef.current;
      providerRef.current = null;
      if (latestProvider) {
        latestProvider.unload().catch((error) => {
          console.warn("[CoreML] unload failed", error);
        });
      }
    };
  }, []);

  const generate = useCallback(
    async (systemPrompt: string, userText: string, signal?: AbortSignal) => {
      if (!provider) {
        throw new CoreMLError(
          "CoreML module not linked. Run: npm i, npx expo prebuild --clean, pod install, then rebuild iOS dev client.",
        );
      }

      if (isGeneratingRef.current) {
        throw new CoreMLError(
          "CoreML generation already in progress. Please wait for the current request to finish.",
        );
      }

      const prompt = buildCoreMLChatPrompt(systemPrompt, userText);

      const abortHandler = () => {
        provider.cancel().catch((error) => {
          console.warn("[CoreML] cancel failed", error);
        });
      };
      signal?.addEventListener("abort", abortHandler, { once: true });

      try {
        isGeneratingRef.current = true;
        const rawOutput = await provider.generate(
          prompt,
          DEFAULT_COREML_GENERATE_OPTIONS,
        );
        return cleanCoreMLOutput(rawOutput, prompt);
      } catch (error) {
        throw toActionableCoreMLError(error);
      } finally {
        isGeneratingRef.current = false;
        signal?.removeEventListener("abort", abortHandler);
      }
    },
    [provider],
  );

  return { provider, isAvailable, generate };
}
