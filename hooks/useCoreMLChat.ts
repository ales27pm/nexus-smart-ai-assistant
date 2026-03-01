import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { CoreMLError } from "@/utils/coreml";
import { CoreMLLLMService, ILLMService } from "@/utils/llmService";
import { reportError } from "@/utils/globalErrorHandler";
import { useAsyncOperation } from "@/hooks/useAsyncOperation";

export function useCoreMLChat(service?: ILLMService) {
  const [isAvailable, setIsAvailable] = useState(false);
  const serviceInstanceRef = useRef<ILLMService>(
    service ?? new CoreMLLLMService(),
  );
  const serviceRef = useRef<ILLMService | null>(null);
  const { isRunning, run } = useAsyncOperation();

  useEffect(() => {
    let disposed = false;

    async function boot() {
      if (Platform.OS !== "ios") return;

      try {
        const serviceInstance = serviceInstanceRef.current;
        await serviceInstance.initialize();

        if (!disposed) {
          serviceRef.current = serviceInstance;
          setIsAvailable(true);
        } else {
          await serviceInstance.dispose();
        }
      } catch (error) {
        reportError({
          error: error instanceof Error ? error : new Error(String(error)),
          severity: "error",
          source: "global-js",
          metadata: { scope: "useCoreMLChat.boot" },
        });
        if (!disposed) {
          serviceRef.current = null;
          setIsAvailable(false);
        }
      }
    }

    boot();

    return () => {
      disposed = true;
      const latestService = serviceRef.current;
      serviceRef.current = null;
      if (latestService) {
        latestService.dispose().catch((error) => {
          reportError({
            error: error instanceof Error ? error : new Error(String(error)),
            severity: "warning",
            source: "global-js",
            metadata: { scope: "useCoreMLChat.dispose" },
          });
        });
      }
    };
  }, []);

  const generate = useCallback(
    async (systemPrompt: string, userText: string, signal?: AbortSignal) => {
      const activeService = serviceRef.current;

      if (!activeService) {
        throw new CoreMLError(
          "CoreML module not linked. Run: npm i, npx expo prebuild --clean, pod install, then rebuild iOS dev client.",
        );
      }

      if (isRunning) {
        throw new CoreMLError(
          "CoreML generation already in progress. Please wait for the current request to finish.",
        );
      }

      return run(() =>
        activeService.generateChatResponse(
          systemPrompt,
          userText,
          undefined,
          signal,
        ),
      );
    },
    [isRunning, run],
  );

  return {
    isAvailable,
    isGenerating: isRunning,
    generate,
    service: serviceRef.current,
  };
}
