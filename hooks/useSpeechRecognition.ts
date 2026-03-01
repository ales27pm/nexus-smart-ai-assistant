import { useCallback, useRef } from "react";
import { Platform } from "react-native";
import type { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { recognizeOnce } from "@/utils/speechRecognition";
import { useAsyncOperation } from "@/hooks/useAsyncOperation";

const DEFAULT_TIMEOUT_MS = 8000;

type SpeechModule = typeof ExpoSpeechRecognitionModule;

export interface ISpeechRecognitionService {
  transcribeOnce(timeoutMs?: number): Promise<string>;
}

export class NativeSpeechRecognitionService implements ISpeechRecognitionService {
  private modulePromise: Promise<SpeechModule> | null = null;

  private async getModule(): Promise<SpeechModule> {
    if (!this.modulePromise) {
      this.modulePromise = import("expo-speech-recognition").then(
        ({ ExpoSpeechRecognitionModule }) => ExpoSpeechRecognitionModule,
      );
    }

    return this.modulePromise;
  }

  async transcribeOnce(
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<string> {
    if (Platform.OS === "web") {
      throw new Error("Speech recognition is not available on web");
    }

    const module = await this.getModule();

    if (!module.isRecognitionAvailable()) {
      throw new Error("Speech recognition service unavailable");
    }

    const permission = await module.requestPermissionsAsync();
    if (!permission.granted) {
      throw new Error("Speech permission was denied");
    }

    const { promise, cancel } = recognizeOnce(module, timeoutMs);

    try {
      module.start({
        lang: "en-US",
        interimResults: true,
        requiresOnDeviceRecognition: false,
        addsPunctuation: true,
      });
    } catch (error) {
      cancel();
      throw error;
    }

    return promise;
  }
}

export function useSpeechRecognition(service?: ISpeechRecognitionService) {
  const serviceRef = useRef<ISpeechRecognitionService>(
    service ?? new NativeSpeechRecognitionService(),
  );
  const { isRunning, run } = useAsyncOperation();

  const transcribeOnce = useCallback(
    async (timeoutMs?: number): Promise<string> => {
      return run(() => serviceRef.current.transcribeOnce(timeoutMs));
    },
    [run],
  );

  return { isListening: isRunning, transcribeOnce };
}
