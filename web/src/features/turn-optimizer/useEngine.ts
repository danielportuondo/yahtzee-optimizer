import { useEffect, useState } from "react";
import { GameEngine } from "../../engine/index.js";
import { loadEngineDataFromUrl } from "../../data/loadFromUrl.js";

export interface EngineHandle {
  engine: GameEngine | null;
  loading: boolean;
  error: Error | null;
}

/** Loads the strategy tables once on mount and builds the GameEngine. */
export function useEngine(): EngineHandle {
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let alive = true;
    loadEngineDataFromUrl()
      .then((data) => alive && setEngine(new GameEngine(data)))
      .catch((e) => alive && setError(e instanceof Error ? e : new Error(String(e))));
    return () => {
      alive = false;
    };
  }, []);

  return { engine, loading: !engine && !error, error };
}
