import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { CoreMLError, CoreMLLoadModelOptions } from "@/utils/coreml";
import { CoreMLManager, coreMLManager } from "@/utils/coreMLManager";
import { reportError } from "@/utils/globalErrorHandler";
import { useAsyncOperation } from "@/hooks/useAsyncOperation";

type CoreMLLoadStatusEvent = {
  state: "downloading model" | "ready" | "failed—retry";
  detail?: string;
};

export function useCoreMLChat(
  manager: CoreMLManager = coreMLManager,
  loadOptions?: CoreMLLoadModelOptions,
) {
  const [isAvailable, setIsAvailable] = useState(false);
  const [loadStatus, setLoadStatus] = useState<CoreMLLoadStatusEvent>({
    state: "downloading model",
  });
  const managerRef = useRef<CoreMLManager>(manager);
  const activeManagerRef = useRef<CoreMLManager | null>(null);
  const { isRunning, runExclusive } = useAsyncOperation();

  useEffect(() => {
    managerRef.current = manager;
  }, [manager]);

  useEffect(() => {
    let disposed = false;

    async function boot() {
      if (Platform.OS !== "ios") return;

      try {
        setLoadStatus({ state: "downloading model" });
        const managerInstance = managerRef.current;
        await managerInstance.initialize(loadOptions);

        if (!disposed) {
          activeManagerRef.current = managerInstance;
          setIsAvailable(true);
          setLoadStatus({ state: "ready" });
        } else {
          await managerInstance.dispose();
        }
      } catch (error) {
        reportError({
          error: error instanceof Error ? error : new Error(String(error)),
          severity: "error",
          source: "global-js",
          metadata: { scope: "useCoreMLChat.boot" },
        });
        if (!disposed) {
          activeManagerRef.current = null;
          setIsAvailable(false);
          setLoadStatus({
            state: "failed—retry",
            detail: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    boot();

    return () => {
      disposed = true;
      const latestManager = activeManagerRef.current;
      activeManagerRef.current = null;
      if (latestManager) {
        latestManager.dispose().catch((error) => {
          reportError({
            error: error instanceof Error ? error : new Error(String(error)),
            severity: "warning",
            source: "global-js",
            metadata: { scope: "useCoreMLChat.dispose" },
          });
        });
      }
    };
  }, [loadOptions]);

  const generate = useCallback(
    async (systemPrompt: string, userText: string, signal?: AbortSignal) => {
      const activeManager = activeManagerRef.current;

      if (!activeManager) {
        throw new CoreMLError(
          "CoreML module not linked. Run: npm i, npx expo prebuild --clean, pod install, then rebuild iOS dev client.",
        );
      }

      return runExclusive(
        () => activeManager.generate(systemPrompt, userText, undefined, signal),
        () =>
          new CoreMLError(
            "CoreML generation already in progress. Please wait for the current request to finish.",
          ),
      );
    },
    [runExclusive],
  );

  return {
    isAvailable,
    isGenerating: isRunning,
    generate,
    service: activeManagerRef.current,
    loadStatus,
  };
}
