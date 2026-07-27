import { useEffect, useState } from "react";
import { loadFindingsFromUrl, type Findings } from "./loadFindings.js";

export interface FindingsHandle {
  findings: Findings | null;
  loading: boolean;
  error: Error | null;
}

/** Loads the Monte Carlo findings once on mount. */
export function useFindings(): FindingsHandle {
  const [findings, setFindings] = useState<Findings | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let alive = true;
    loadFindingsFromUrl()
      .then((f) => alive && setFindings(f))
      .catch((e) => alive && setError(e instanceof Error ? e : new Error(String(e))));
    return () => {
      alive = false;
    };
  }, []);

  return { findings, loading: !findings && !error, error };
}
