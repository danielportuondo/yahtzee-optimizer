/**
 * Tests for the recommendation layer (`GameEngine.recommend`).
 *
 * The layer adds no DP math, so the strongest check is self-consistency against the already
 * cross-checked `turnValue`: the roll-1 recommendation's best EV per hand *is* the DP's `e1`,
 * so `Σ_h rollProb[h] · recommend(state, hand, 1).ev` must equal `turnValueForState(state)`.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadEngineDataFromDir } from "../dataNode.js";
import { GameEngine } from "../gameDp.js";
import { Category, YAHTZEE_BIT, type Counts } from "../types.js";
import type { TurnState } from "../recommend.js";

interface StateCase {
  mask: number;
  elig: number;
  upper: number;
  index: number;
  turn_value: number;
}
interface Fixture {
  states: StateCase[];
}

const DATA_DIR = fileURLToPath(new URL("../../../public/data", import.meta.url));
const FIXTURE_PATH = fileURLToPath(new URL("../__fixtures__/crosscheck.json", import.meta.url));

const data = loadEngineDataFromDir(DATA_DIR);
const engine = new GameEngine(data);
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Fixture;

/** Ordered dice (ascending face) realizing a face-count multiset. */
function diceFromCounts(counts: Counts): number[] {
  const dice: number[] = [];
  for (let f = 0; f < counts.length; f++) for (let n = 0; n < counts[f]; n++) dice.push(f + 1);
  return dice;
}

describe("recommend", () => {
  it("roll-1 best EVs reconstruct turnValue (Σ rollProb·ev == turnValue)", () => {
    const rollProb = engine.transitions.rollProb;
    // A few reachable states from the cross-check fixture, plus the empty scorecard.
    const states: TurnState[] = [{ mask: 0, eligible: 0, upper: 0 }];
    for (const s of fixture.states.slice(0, 4)) {
      states.push({ mask: s.mask, eligible: s.elig as 0 | 1, upper: s.upper });
    }

    for (const state of states) {
      let acc = 0;
      for (let h = 0; h < data.rolls.length; h++) {
        const rec = engine.recommend(state, diceFromCounts(data.rolls[h]), 1);
        acc += rollProb[h] * rec.ev;
      }
      const expected = engine.turnValueForState(state.mask, state.eligible, state.upper);
      expect(Math.abs(acc - expected)).toBeLessThan(1e-6);
    }
  });

  it("roll 3 ranks all open categories with best = max EV", () => {
    const rec = engine.recommend({ mask: 0, eligible: 0, upper: 0 }, [2, 3, 3, 5, 6], 3);
    expect(rec.kind).toBe("score");
    if (rec.kind !== "score") throw new Error("expected score recommendation");
    expect(rec.alternatives).toHaveLength(13); // empty scorecard → all categories open
    for (let i = 1; i < rec.alternatives.length; i++) {
      expect(rec.alternatives[i - 1].ev).toBeGreaterThanOrEqual(rec.alternatives[i].ev);
    }
    expect(rec.best).toBe(rec.alternatives[0]);
    expect(rec.best.ev).toBe(Math.max(...rec.alternatives.map((o) => o.ev)));
  });

  it("roll 1/2 heldDiceIndices reconstruct the recommended keep multiset", () => {
    const dice = [1, 1, 1, 4, 6];
    for (const roll of [1, 2] as const) {
      const rec = engine.recommend({ mask: 0, eligible: 0, upper: 0 }, dice, roll);
      if (rec.kind !== "keep") throw new Error("expected keep recommendation");
      for (const opt of rec.alternatives) {
        const got = [0, 0, 0, 0, 0, 0];
        for (const i of opt.heldDiceIndices) got[dice[i] - 1]++;
        expect(got).toEqual(opt.keep);
        expect(new Set(opt.heldDiceIndices).size).toBe(opt.heldDiceIndices.length);
      }
    }
  });

  it("roll 3 with a box-filled extra Yahtzee follows the joker rule", () => {
    // Only the Yahtzee box filled (eligible), rolling five 3s → forced into the open Threes box,
    // with the +100 Yahtzee bonus: score = 15 (five 3s) + 100.
    const rec = engine.recommend({ mask: YAHTZEE_BIT, eligible: 1, upper: 0 }, [3, 3, 3, 3, 3], 3);
    if (rec.kind !== "score") throw new Error("expected score recommendation");
    expect(rec.alternatives).toHaveLength(1);
    expect(rec.best.category).toBe(Category.THREES);
    expect(rec.best.score).toBe(115);
  });

  it("rejects malformed dice", () => {
    const state: TurnState = { mask: 0, eligible: 0, upper: 0 };
    expect(() => engine.recommend(state, [1, 2, 3], 1)).toThrow();
    expect(() => engine.recommend(state, [1, 2, 3, 4, 7], 1)).toThrow();
  });
});
