import { useRef, useEffect, useMemo } from 'react';

export interface DebouncedHandle<A extends unknown[]> {
  (...args: A): void;
  flush: () => void;
  cancel: () => void;
  isPending: () => boolean;
}

export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs: number,
): DebouncedHandle<A> {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  const argsRef = useRef<A | null>(null);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return useMemo(() => {
    const handle = (...args: A) => {
      argsRef.current = args;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (argsRef.current) {
          fnRef.current(...argsRef.current);
          argsRef.current = null;
        }
      }, delayMs);
    };

    handle.flush = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        if (argsRef.current) {
          fnRef.current(...argsRef.current);
          argsRef.current = null;
        }
      }
    };

    handle.cancel = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      argsRef.current = null;
    };

    handle.isPending = () => timerRef.current !== null;

    return handle;
  }, [delayMs]);
}
