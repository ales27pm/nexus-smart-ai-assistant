import { recognizeOnce } from "../utils/speechRecognition";

type ListenerMap = Record<string, Array<(event: any) => void>>;

function createMockModule() {
  const listeners: ListenerMap = {};
  const stop = jest.fn();

  return {
    stop,
    addListener: (name: string, cb: (event: any) => void) => {
      listeners[name] ||= [];
      listeners[name].push(cb);
      return {
        remove: () => {
          listeners[name] = (listeners[name] || []).filter((fn) => fn !== cb);
        },
      };
    },
    emit: (name: string, event: any) => {
      for (const cb of listeners[name] || []) {
        cb(event);
      }
    },
  };
}

describe("recognizeOnce", () => {
  it("resolves on final result", async () => {
    const module = createMockModule();
    const { promise } = recognizeOnce(module as any, 1000);

    module.emit("result", {
      isFinal: true,
      results: [{ transcript: "hello world" }],
    });

    await expect(promise).resolves.toBe("hello world");
    expect(module.stop).toHaveBeenCalled();
  });

  it("rejects on timeout", async () => {
    jest.useFakeTimers();
    const module = createMockModule();
    const { promise } = recognizeOnce(module as any, 50);

    jest.advanceTimersByTime(60);

    await expect(promise).rejects.toThrow("No speech detected in time");
    expect(module.stop).toHaveBeenCalled();
    jest.useRealTimers();
  });
});
