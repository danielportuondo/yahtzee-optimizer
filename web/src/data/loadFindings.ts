/**
 * Loader for the Monte Carlo findings (`solver/findings.py` → `web/public/data/findings.json`).
 * Mirrors `loadFromUrl.ts`: resolved relative to Vite's `BASE_URL`, so it works identically on
 * a GitHub Pages subpath or a custom-domain root.
 */

export interface Findings {
  format_version: number;
  optimal_expected_score: number;
  simulation: {
    games: number;
    seed: number;
    distinct_states: number;
    mean: number;
    std: number;
    min: number;
    max: number;
    percentiles: Record<string, number>;
  };
  distribution: {
    bin_width: number;
    edges: number[];
    counts: number[];
    cdf: number[];
  };
  probabilities: {
    upper_bonus: number;
    at_least_one_yahtzee: number;
    yahtzee_bonus_ge1: number;
    any_zero_scored: number;
  };
  category_contribution: { category: string; mean: number; zero_rate: number }[];
  bonus_contribution: { upper_bonus_mean: number; yahtzee_bonus_mean: number };
  opening_keeps: { roll: number[]; keep: number[] }[];
}

/** Fetch and parse `${baseUrl}data/findings.json`. */
export async function loadFindingsFromUrl(
  baseUrl: string = import.meta.env.BASE_URL,
): Promise<Findings> {
  const url = `${baseUrl.replace(/\/?$/, "/")}data/findings.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to load ${url}: ${res.status} ${res.statusText}`);
  return (await res.json()) as Findings;
}
