import { useCallback, useEffect, useRef, useState } from "react";

export function useAsyncOperation() {
  const [isRunning, setIsRunning] = useState(false);
  const isMountedRef = useRef(true);
  const inFlightCountRef = useRef(0);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const run = useCallback(async <T>(operation: () => Promise<T>): Promise<T> => {
    inFlightCountRef.current += 1;
    if (inFlightCountRef.current === 1 && isMountedRef.current) {
      setIsRunning(true);
    }

    try {
      return await operation();
    } finally {
      inFlightCountRef.current = Math.max(0, inFlightCountRef.current - 1);
      if (inFlightCountRef.current === 0 && isMountedRef.current) {
        setIsRunning(false);
      }
    }
  }, []);

  const runExclusive = useCallback(
    async <T>(operation: () => Promise<T>, onBusy?: () => Error): Promise<T> => {
      if (inFlightCountRef.current > 0) {
        throw onBusy?.() ?? new Error("Async operation already in progress");
      }

      return run(operation);
    },
    [run],
  );

  return { isRunning, run, runExclusive };
}
