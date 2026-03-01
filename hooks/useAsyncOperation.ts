import { useCallback, useEffect, useRef, useState } from "react";

export function useAsyncOperation() {
  const [isRunning, setIsRunning] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const run = useCallback(
    async <T>(operation: () => Promise<T>): Promise<T> => {
      setIsRunning(true);
      try {
        return await operation();
      } finally {
        if (isMountedRef.current) {
          setIsRunning(false);
        }
      }
    },
    [],
  );

  return { isRunning, run };
}
