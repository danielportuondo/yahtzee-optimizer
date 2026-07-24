/**
 * Phase 3 exit gate: the TypeScript engine must match the Python solver.
 *
 * Loads the same exported data files plus the Python-generated fixture
 * (`__fixtures__/crosscheck.json`, produced by `uv run python -m solver.crosscheck`) and asserts
 * scores are bit-identical and turn EVs agree within float32 tolerance.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadEngineDataFromDir } from "../data.js";
import { GameEngine } from "../gameDp.js";
import { scoreCategory } from "../scoring.js";
import type { Category, Counts } from "../types.js";

interface ScoringCase {
  cat: number;
  counts: Counts;
  joker: boolean;
  score: number;
}
interface StateCase {
  mask: number;
  elig: number;
  upper: number;
  index: number;
  turn_value: number;
}
interface Fixture {
  seed: number;
  golden: { index: number; optimal_expected_score: number };
  scoring: ScoringCase[];
  states: StateCase[];
}

// Python V is float64, TS reads float32; small rounding is expected (cf. test_export.py's 1e-2).
const EV_TOLERANCE = 1e-2;

const DATA_DIR = fileURLToPath(new URL("../../../public/data", import.meta.url));
const FIXTURE_PATH = fileURLToPath(new URL("../__fixtures__/crosscheck.json", import.meta.url));

const data = loadEngineDataFromDir(DATA_DIR);
const engine = new GameEngine(data);
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Fixture;

describe("Python↔TS cross-check", () => {
  it("scoreCategory is bit-identical to Python across all sampled hands", () => {
    expect(fixture.scoring.length).toBeGreaterThan(0);
    const mismatches: string[] = [];
    for (const c of fixture.scoring) {
      const got = scoreCategory(c.cat as Category, c.counts, c.joker);
      if (got !== c.score) {
        mismatches.push(`cat=${c.cat} counts=[${c.counts}] joker=${c.joker}: ${got} != ${c.score}`);
      }
    }
    expect(mismatches, mismatches.slice(0, 5).join("; ")).toHaveLength(0);
  });

  it("turnValue matches Python within tolerance (parity)", () => {
    expect(fixture.states.length).toBeGreaterThan(0);
    let worst = 0;
    let worstDesc = "";
    for (const s of fixture.states) {
      const got = engine.turnValueForState(s.mask, s.elig, s.upper);
      const err = Math.abs(got - s.turn_value);
      if (err > worst) {
        worst = err;
        worstDesc = `mask=${s.mask} elig=${s.elig} upper=${s.upper}: ${got} vs ${s.turn_value}`;
      }
    }
    expect(worst, `worst parity error ${worst} @ ${worstDesc}`).toBeLessThanOrEqual(EV_TOLERANCE);
  });

  it("turnValue reproduces the loaded V table (pipeline self-consistency)", () => {
    let worst = 0;
    let worstDesc = "";
    for (const s of fixture.states) {
      const got = engine.turnValueForState(s.mask, s.elig, s.upper);
      const err = Math.abs(got - data.V[s.index]);
      if (err > worst) {
        worst = err;
        worstDesc = `mask=${s.mask} elig=${s.elig} upper=${s.upper}: ${got} vs V=${data.V[s.index]}`;
      }
    }
    expect(worst, `worst self-consistency error ${worst} @ ${worstDesc}`).toBeLessThanOrEqual(
      EV_TOLERANCE,
    );
  });

  it("reproduces the golden optimal expected score (254.5877)", () => {
    const ev = engine.turnValueForState(0, 0, 0);
    expect(ev).toBeCloseTo(fixture.golden.optimal_expected_score, 2);
    expect(ev).toBeCloseTo(254.5877, 2);
  });
});
