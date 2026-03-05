import React from "react";
import TestRenderer, { act } from "react-test-renderer";

import { useCoreMLChat } from "@/hooks/useCoreMLChat";
import { CoreMLLoadModelOptions } from "@/utils/coreml";
import { CoreMLManager, CoreMLManagerState } from "@/utils/coreMLManager";

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
});
