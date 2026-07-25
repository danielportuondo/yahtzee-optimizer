/**
 * Tests for the playable-game logic (`gameState.ts`, `dice.ts`).
 *
 * These are pure Node tests over the real strategy tables (like `recommend.test.ts`): the game
 * layer adds no DP math, so the checks pin the transition/grading composition — score identity,
 * reachability after every booking, the two joker/bonus edge cases, and that a fully optimal game
 * leaves ~0 EV on the table.
 */

import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { loadEngineDataFromDir } from "../../../engine/dataNode.js";
import { Category, GameEngine } from "../../../engine/index.js";
import { deriveTurnState, type Scorecard } from "../../turn-optimizer/scorecard.js";
import { initialRoll, rollDice } from "../dice.js";
import {
  applyBooking,
  emptyPlay,
  gradeKeep,
  finalGrade,
  scoreBreakdown,
  totalEvLost,
  type PlayState,
} from "../gameState.js";

const DATA_DIR = fileURLToPath(new URL("../../../../public/data", import.meta.url));
const engine = new GameEngine(loadEngineDataFromDir(DATA_DIR));

/** Deterministic PRNG so a driven game is reproducible when we stub Math.random. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** After a non-final booking the state must stay reachable (finite V, never NaN). */
function expectReachable(play: PlayState): void {
  if (play.turnIndex >= 13) return;
  const probe = engine.recommend(deriveTurnState(play.card), [1, 2, 3, 4, 5], 1);
  expect(Number.isFinite(probe.ev)).toBe(true);
}

describe("dice", () => {
  it("rollDice rerolls only non-held positions, preserving order and length", () => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.5); // → 1 + floor(3) = 4
    const next = rollDice([1, 2, 3, 4, 5], new Set([0, 2, 4]));
    spy.mockRestore();
    expect(next).toEqual([1, 4, 3, 4, 5]);
  });

  it("initialRoll returns five faces in 1..6", () => {
    const r = initialRoll();
    expect(r).toHaveLength(5);
    for (const f of r) {
      expect(f).toBeGreaterThanOrEqual(1);
      expect(f).toBeLessThanOrEqual(6);
    }
  });
});

describe("gameState — scripted game", () => {
  // A hand-verified 13-turn game: crosses the upper +35 exactly once (turn 4) and books two extra
  // Yahtzees (turns 2 & 3, +100 each). Turns 2/3 are forced by the joker rule into the matching
  // upper box; the rest are ordinary bookings scored on roll 3.
  const script: Array<{ dice: number[]; category: Category }> = [
    { dice: [5, 5, 5, 5, 5], category: Category.YAHTZEE }, // 50, box→fifty (eligible)
    { dice: [6, 6, 6, 6, 6], category: Category.SIXES }, // 30 + 100
    { dice: [5, 5, 5, 5, 5], category: Category.FIVES }, // 25 + 100
    { dice: [4, 4, 4, 3, 2], category: Category.FOURS }, // 12, upper 55→67 crosses +35
    { dice: [3, 3, 2, 1, 6], category: Category.THREES }, // 6
    { dice: [2, 2, 2, 1, 1], category: Category.TWOS }, // 6
    { dice: [1, 1, 4, 5, 6], category: Category.ACES }, // 2
    { dice: [3, 3, 3, 4, 5], category: Category.THREE_OF_A_KIND }, // 18
    { dice: [2, 2, 2, 2, 5], category: Category.FOUR_OF_A_KIND }, // 13
    { dice: [3, 3, 3, 6, 6], category: Category.FULL_HOUSE }, // 25
    { dice: [1, 2, 3, 4, 6], category: Category.SMALL_STRAIGHT }, // 30
    { dice: [2, 3, 4, 5, 6], category: Category.LARGE_STRAIGHT }, // 40
    { dice: [6, 6, 5, 4, 1], category: Category.CHANCE }, // 22
  ];

  it("running total equals Σ booked totals and reconciles bonuses", () => {
    let play = emptyPlay();
    script.forEach((s, i) => {
      play = applyBooking(play, s.category, s.dice, 3, engine);
      if (i === 1) expect(play.card.upper[5]).toBe(5); // joker five-6s → Sixes count 5
      if (i === 2) expect(play.card.upper[4]).toBe(5); // joker five-5s → Fives count 5
      expectReachable(play);
    });

    const sumTotals = play.bookings.reduce((s, b) => s + (b?.total ?? 0), 0);
    expect(play.runningScore).toBe(sumTotals);

    const bd = scoreBreakdown(play);
    expect(bd.grandTotal).toBe(play.runningScore);
    expect(bd.upperBonus).toBe(35);
    expect(bd.yahtzeeBonus).toBe(200); // two extra Yahtzees
    expect(bd.upperSubtotal + bd.lowerBase + bd.upperBonus + bd.yahtzeeBonus).toBe(bd.grandTotal);
    expect(play.runningScore).toBe(514);
  });
});

describe("gameState — joker edge cases", () => {
  it("DEFECT-1: a zeroed Yahtzee box still grants the wildcard (Full House base = 25)", () => {
    // Yahtzee scored 0 (not 50 → not eligible for +100), Threes filled so a five-of-3s must go to a
    // lower box as a joker. Full House pays its fixed 25 with no bonus.
    const card: Scorecard = {
      upper: [null, null, 4, null, null, null],
      lower: [false, false, false, false, false, false],
      yahtzee: "zero",
    };
    const play: PlayState = { ...emptyPlay(), card, turnIndex: 2 };
    const after = applyBooking(play, Category.FULL_HOUSE, [3, 3, 3, 3, 3], 3, engine);
    const booking = after.bookings[Category.FULL_HOUSE];
    expect(booking?.total).toBe(25);
    expect(booking?.base).toBe(25); // would be 0 under the too-strict "fifty"-only gate
  });

  it("forced-zero: an extra Yahtzee with no legal home scores base 0 + 100", () => {
    // Yahtzee=50 (eligible), Aces (matching for five-1s) filled, all lower filled → forced 0 into an
    // open upper box (Twos). score = 0 + 100.
    const card: Scorecard = {
      upper: [3, null, 4, 5, 5, 5],
      lower: [true, true, true, true, true, true],
      yahtzee: "fifty",
    };
    const play: PlayState = { ...emptyPlay(), card, turnIndex: 12 };
    const after = applyBooking(play, Category.TWOS, [1, 1, 1, 1, 1], 3, engine);
    const booking = after.bookings[Category.TWOS];
    expect(booking?.total).toBe(100);
    expect(booking?.base).toBe(0);
    expect(after.card.upper[1]).toBe(0); // count of Twos-faces booked = 0
  });
});

describe("gameState — grading", () => {
  it("every hold subset matches a keep alternative; best held loses 0", () => {
    const play = emptyPlay();
    const dice = [1, 1, 1, 4, 6]; // duplicate faces
    for (const roll of [1, 2] as const) {
      const rec = engine.recommend(deriveTurnState(play.card), dice, roll);
      if (rec.kind !== "keep") throw new Error("expected keep recommendation");
      expect(gradeKeep(play, dice, new Set(rec.best.heldDiceIndices), roll, engine).evLost).toBeLessThan(
        1e-9,
      );
      for (let m = 0; m < 32; m++) {
        const held = new Set<number>();
        for (let i = 0; i < 5; i++) if (m & (1 << i)) held.add(i);
        expect(gradeKeep(play, dice, held, roll, engine).evLost).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("early scoring (roll 1) is graded against the keep optimum, and is non-negative", () => {
    const play = emptyPlay();
    const dice = [2, 2, 5, 5, 5];
    const state = deriveTurnState(play.card);
    const keepRec = engine.recommend(state, dice, 1);
    const scoreRec = engine.recommend(state, dice, 3);
    if (scoreRec.kind !== "score") throw new Error("expected score recommendation");
    const opt = scoreRec.alternatives.find((a) => a.category === Category.FIVES);
    const expectedLoss = Math.max(0, keepRec.ev - (opt?.ev ?? 0));

    const after = applyBooking(play, Category.FIVES, dice, 1, engine);
    const g = after.grades[after.grades.length - 1];
    expect(g.evLost).toBeCloseTo(expectedLoss, 9);
    expect(g.evLost).toBeGreaterThanOrEqual(0);
  });

  it("a fully optimal game leaves ~0 EV on the table over all 13 turns", () => {
    const spy = vi.spyOn(Math, "random").mockImplementation(mulberry32(0xc0ffee));
    let play = emptyPlay();
    for (let turn = 0; turn < 13; turn++) {
      let dice = initialRoll();
      let held = new Set<number>();
      for (const roll of [1, 2] as const) {
        const rec = engine.recommend(deriveTurnState(play.card), dice, roll);
        if (rec.kind !== "keep") throw new Error("expected keep recommendation");
        held = new Set(rec.best.heldDiceIndices);
        play = { ...play, grades: [...play.grades, gradeKeep(play, dice, held, roll, engine)] };
        dice = rollDice(dice, held);
      }
      const rec3 = engine.recommend(deriveTurnState(play.card), dice, 3);
      if (rec3.kind !== "score") throw new Error("expected score recommendation");
      play = applyBooking(play, rec3.best.category, dice, 3, engine);
      expectReachable(play);
    }
    spy.mockRestore();
    expect(play.turnIndex).toBe(13);
    expect(totalEvLost(play)).toBeLessThan(1e-6);
    expect(finalGrade(totalEvLost(play)).letter).toBe("S");
  });
});
