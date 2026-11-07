import { useCallback, useEffect, useRef, useState } from "react";

export interface Resource<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (v: T) => void;
}

/**
 * Loads data with `loader`, re-running when `deps` change.
 * While `poll(data)` returns true, it reloads every `interval` ms.
 */
export function useResource<T>(
  loader: () => Promise<T>,
  deps: unknown[],
  opts: { poll?: (data: T | null) => boolean; interval?: number } = {},
): Resource<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const gen = useRef(0);

  const reload = useCallback(async () => {
    const my = ++gen.current;
    try {
      const v = await loaderRef.current();
      if (my !== gen.current) return;
      setDataState(v);
      setError(null);
    } catch (e) {
      if (my !== gen.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (my === gen.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setDataState(null);
    setError(null);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const pollFn = opts.poll;
  const shouldPoll = pollFn ? pollFn(data) : false;
  const interval = opts.interval ?? 1000;
  useEffect(() => {
    if (!shouldPoll) return;
    const t = setInterval(() => void reload(), interval);
    return () => clearInterval(t);
  }, [shouldPoll, interval, reload]);

  const setData = useCallback((v: T) => {
    gen.current++; // drop in-flight responses that would overwrite this
    setDataState(v);
    setError(null);
  }, []);

  return { data, error, loading, reload, setData };
}

export function useNow(interval = 15000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), interval);
    return () => clearInterval(t);
  }, [interval]);
}
