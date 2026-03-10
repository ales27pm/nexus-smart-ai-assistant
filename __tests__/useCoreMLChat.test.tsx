import React from "react";
import TestRenderer, { act } from "react-test-renderer";

import { useCoreMLChat } from "@/hooks/useCoreMLChat";
import { CoreMLGenerateOptions, CoreMLLoadModelOptions } from "@/utils/coreml";
import { CoreMLManager, CoreMLManagerState } from "@/utils/coreMLManager";

import { createDeferred } from "./utils/asyncTestUtils";

jest.mock("react-native", () => ({
  Platform: {
    OS: "ios",
  },
}));

jest.mock("@/utils/globalErrorHandler", () => ({
  reportError: jest.fn(),
}));

type ManagerMock = Pick<
  CoreMLManager,
  | "initialize"
  | "dispose"
  | "generate"
  | "generateStream"
  | "getActiveComputeUnits"
  | "getState"
  | "onStateChange"
>;

function createManagerMock(initialState: CoreMLManagerState = "Idle"): {
  manager: CoreMLManager;
  initialize: jest.Mock<Promise<void>, [CoreMLLoadModelOptions | undefined]>;
  dispose: jest.Mock<Promise<void>, []>;
} {
  const listeners = new Set<(event: { state: CoreMLManagerState }) => void>();
  let state = initialState;

  const initialize = jest.fn(async () => {
    state = "Ready";
    listeners.forEach((listener) => listener({ state }));
  });
  const dispose = jest.fn(async () => {
    state = "Idle";
    listeners.forEach((listener) => listener({ state }));
  });
  const generate = jest.fn(async () => "ok");
  const generateStream = jest.fn(async () => "ok-stream");
  const getActiveComputeUnits = jest.fn(() => "all");
  const getState = jest.fn(() => state);
  const onStateChange = jest.fn(
    (listener: (event: { state: CoreMLManagerState }) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  );

  const manager: ManagerMock = {
    initialize,
    dispose,
    generate,
    generateStream,
    getActiveComputeUnits,
    getState,
    onStateChange,
  };

  return {
    manager: manager as CoreMLManager,
    initialize,
    dispose,
  };
}

function HookHarness({
  manager,
  loadOptions,
}: {
  manager: CoreMLManager;
  loadOptions?: CoreMLLoadModelOptions;
}) {
  useCoreMLChat(manager, loadOptions);
  return null;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("useCoreMLChat", () => {
  it("forwards stream generation options to manager.generateStream", async () => {
    const managerSetup = createManagerMock("Ready");
    let capturedHook: ReturnType<typeof useCoreMLChat> | null = null;

    function CaptureHarness({ manager }: { manager: CoreMLManager }) {
      capturedHook = useCoreMLChat(manager);
      return null;
    }

    await act(async () => {
      TestRenderer.create(<CaptureHarness manager={managerSetup.manager} />);
    });
    await flushEffects();

    const options: CoreMLGenerateOptions & { maxContext?: number } = {
      temperature: 0.3,
      maxNewTokens: 8,
      maxContext: 1024,
    };

    await act(async () => {
      await capturedHook?.generateStream(
        "system",
        "user",
        () => {},
        options,
        undefined,
      );
    });

    const managerAsMock = managerSetup.manager as unknown as {
      generateStream: jest.Mock;
    };
    expect(managerAsMock.generateStream).toHaveBeenCalledWith(
      "system",
      "user",
      expect.any(Function),
      options,
      undefined,
    );
  });

  it("disposes the previous manager and initializes the new one when manager changes", async () => {
    const first = createManagerMock();
    const second = createManagerMock();

    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<HookHarness manager={first.manager} />);
    });
    await flushEffects();

    expect(first.initialize).toHaveBeenCalledTimes(1);
    expect(first.dispose).not.toHaveBeenCalled();

    await act(async () => {
      renderer!.update(<HookHarness manager={second.manager} />);
    });
    await flushEffects();

    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(second.initialize).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer!.unmount();
    });
    await flushEffects();

    expect(second.dispose).toHaveBeenCalledTimes(1);
  });

  it("serializes repeated manager replacement before prior cleanup completes", async () => {
    const first = createManagerMock();
    const second = createManagerMock();
    const third = createManagerMock();

    const firstDisposeDeferred = createDeferred<void>();
    const secondDisposeDeferred = createDeferred<void>();
    const operationOrder: string[] = [];
    let inFlightDisposals = 0;

    first.dispose.mockImplementation(async () => {
      operationOrder.push("first:dispose:start");
      inFlightDisposals += 1;
      await firstDisposeDeferred.promise;
      inFlightDisposals -= 1;
      operationOrder.push("first:dispose:end");
    });

    second.dispose.mockImplementation(async () => {
      operationOrder.push("second:dispose:start");
      inFlightDisposals += 1;
      await secondDisposeDeferred.promise;
      inFlightDisposals -= 1;
      operationOrder.push("second:dispose:end");
    });

    second.initialize.mockImplementation(async () => {
      operationOrder.push("second:initialize");
    });
    third.initialize.mockImplementation(async () => {
      operationOrder.push("third:initialize");
    });

    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<HookHarness manager={first.manager} />);
    });
    await flushEffects();

    expect(first.initialize).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer!.update(<HookHarness manager={second.manager} />);
    });
    await flushEffects();

    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(second.initialize).toHaveBeenCalledTimes(1);
    expect(inFlightDisposals).toBe(1);

    await act(async () => {
      renderer!.update(<HookHarness manager={third.manager} />);
    });
    await flushEffects();

    expect(second.dispose).toHaveBeenCalledTimes(1);
    expect(third.initialize).toHaveBeenCalledTimes(1);
    expect(inFlightDisposals).toBeGreaterThanOrEqual(1);

    firstDisposeDeferred.resolve();
    await flushEffects();

    secondDisposeDeferred.resolve();
    await flushEffects();

    await act(async () => {
      renderer!.unmount();
    });
    await flushEffects();

    expect(third.dispose).toHaveBeenCalledTimes(1);
    expect(operationOrder).toEqual([
      "first:dispose:start",
      "second:initialize",
      "second:dispose:start",
      "third:initialize",
      "first:dispose:end",
      "second:dispose:end",
    ]);
  });
});
