import { useCallback, useEffect, useRef } from "react";
import { useAsyncOperation } from "@/hooks/useAsyncOperation";
import {
  ISpeechRecognitionService,
  NativeSpeechRecognitionService,
} from "@/utils/speechRecognitionService";

export function useSpeechRecognition(service?: ISpeechRecognitionService) {
  const serviceRef = useRef<ISpeechRecognitionService>(
    service ?? new NativeSpeechRecognitionService(),
  );
  const { isRunning, runExclusive } = useAsyncOperation();

  useEffect(() => {
    if (service) {
      serviceRef.current = service;
    }
  }, [service]);

  const transcribeOnce = useCallback(
    async (timeoutMs?: number): Promise<string> => {
      return runExclusive(() => serviceRef.current.transcribeOnce(timeoutMs));
    },
    [runExclusive],
  );

  return { isListening: isRunning, transcribeOnce };
}
