import type {
  ExpoSpeechRecognitionErrorEvent,
  ExpoSpeechRecognitionModule,
  ExpoSpeechRecognitionResultEvent,
} from "expo-speech-recognition";

type SpeechModule = typeof ExpoSpeechRecognitionModule;

type RecognitionResult = {
  promise: Promise<string>;
  cancel: () => void;
};

export function recognizeOnce(
  module: SpeechModule,
  timeoutMs: number,
): RecognitionResult {
  let transcript = "";
  let settled = false;

  let resolveFn: (value: string) => void = () => {};
  let rejectFn: (reason?: unknown) => void = () => {};

  const promise = new Promise<string>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });

  const timeout = setTimeout(() => {
    if (!settled) {
      settled = true;
      cleanUp();
      rejectFn(new Error("No speech detected in time"));
    }
  }, timeoutMs);

  const resultSub = module.addListener(
    "result",
    (event: ExpoSpeechRecognitionResultEvent) => {
      transcript = event.results?.[0]?.transcript ?? transcript;
      if (event.isFinal && transcript && !settled) {
        settled = true;
        cleanUp();
        resolveFn(transcript);
      }
    },
  );

  const errorSub = module.addListener(
    "error",
    (event: ExpoSpeechRecognitionErrorEvent) => {
      if (!settled) {
        settled = true;
        cleanUp();
        rejectFn(
          new Error(
            event.message ?? event.error ?? "Speech recognition failed",
          ),
        );
      }
    },
  );

  const endSub = module.addListener("end", () => {
    if (!settled) {
      settled = true;
      cleanUp();
      if (transcript) {
        resolveFn(transcript);
      } else {
        rejectFn(new Error("No speech detected"));
      }
    }
  });

  function cleanUp() {
    clearTimeout(timeout);
    resultSub.remove();
    errorSub.remove();
    endSub.remove();
    try {
      module.stop();
    } catch {
      // no-op
    }
  }

  function cancel() {
    if (!settled) {
      settled = true;
      cleanUp();
      rejectFn(new Error("Speech recognition cancelled"));
    }
  }

  return { promise, cancel };
}
