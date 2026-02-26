import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import {
  CoreMLError,
  buildCoreMLChatPrompt,
  cleanCoreMLOutput,
  DEFAULT_COREML_GENERATE_OPTIONS,
  normalizeCoreMLError,
} from "@/utils/coreml";
import { ICoreMLProvider, NativeCoreMLProvider } from "@/utils/coremlProvider";

const COREML_ACTIONABLE_ERRORS: Record<number, string> = {
  101: "CoreML model resource missing. Redownload model assets and rebuild the app.",
  102: "CoreML memory pressure detected. Free up memory by closing apps and retry.",
};

function toActionableError(error: unknown): CoreMLError {
  const normalized = normalizeCoreMLError(error);
  if (!normalized.code) return normalized;

  const hint = COREML_ACTIONABLE_ERRORS[normalized.code];
  if (!hint) return normalized;
  return new CoreMLError(`${normalized.message} (${hint})`, normalized.code);
}

export function useCoreMLChat() {
  const [provider, setProvider] = useState<ICoreMLProvider | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);

  useEffect(() => {
    let disposed = false;

    async function boot() {
      if (Platform.OS !== "ios") return;

      try {
        const instance = new NativeCoreMLProvider();
        await instance.isLoaded();
        await instance.load();

        if (!disposed) {
          setProvider(instance);
          setIsAvailable(true);
        }
      } catch (error) {
        console.error("[CoreML] boot failed", error);
        if (!disposed) {
          setProvider(null);
          setIsAvailable(false);
        }
      }
    }

    boot();

    return () => {
      disposed = true;
      if (provider) {
        provider.unload().catch((error) => {
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

      const prompt = buildCoreMLChatPrompt(systemPrompt, userText);

      const abortHandler = () => {
        provider.cancel().catch((error) => {
          console.warn("[CoreML] cancel failed", error);
        });
      };
      signal?.addEventListener("abort", abortHandler, { once: true });

      try {
        const rawOutput = await provider.generate(
          prompt,
          DEFAULT_COREML_GENERATE_OPTIONS,
        );
        return cleanCoreMLOutput(rawOutput, prompt);
      } catch (error) {
        throw toActionableError(error);
      } finally {
        signal?.removeEventListener("abort", abortHandler);
      }
    },
    [provider],
  );

  return { provider, isAvailable, generate };
}
