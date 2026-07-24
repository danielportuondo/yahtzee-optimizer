/**
 * Within-turn dynamic program. Verbatim port of `solver/game_dp.py` (`state_index`,
 * `_joker_best`, `_turn_value`, and the per-state driver setup in `solve`).
 *
 * A game state is `(mask, eligible, upper)`; `V[stateIndex(...)]` is the solved expected
 * additional score (loaded from `v.f32`). `turnValue` recomputes one optimal turn from the
 * loaded V of the one-more-category-filled successor states — so for a correct V it reproduces
 * `V[stateIndex(state)]` (a strong self-consistency check exploited by the cross-check test).
 *
 * Bonuses are applied here, not in `scoreCategory`: the +35 upper bonus is awarded the turn the
 * subtotal first reaches 63; the +100 Yahtzee bonus is awarded whenever an extra Yahtzee is
 * scored while `eligible`; the Hasbro joker rule constrains where an extra Yahtzee may go.
 */

import {
  Category,
  NUM_CATEGORIES,
  NUM_ROLLS,
  UPPER_BONUS,
  UPPER_BONUS_THRESHOLD,
  YAHTZEE_BIT,
  YAHTZEE_BONUS,
} from "./types.js";
import type { EngineData } from "./data.js";
import { Transitions } from "./transitions.js";
import { isYahtzee, scoreCategory } from "./scoring.js";

export class GameEngine {
  readonly data: EngineData;
  readonly transitions: Transitions;
  private readonly V: Float32Array;
  private readonly baseNormal: Int32Array; // [NUM_CATEGORIES * NUM_ROLLS]
  private readonly baseJoker: Int32Array; // [NUM_CATEGORIES * NUM_ROLLS]
  private readonly isYahtzeeInt: Int32Array; // [NUM_ROLLS]
  private readonly yahHand: number[]; // roll index of the five-of-a-kind hand, per face

  constructor(data: EngineData) {
    this.data = data;
    this.V = data.V;
    this.transitions = new Transitions(data);

    const rolls = data.rolls;
    this.baseNormal = new Int32Array(NUM_CATEGORIES * NUM_ROLLS);
    this.baseJoker = new Int32Array(NUM_CATEGORIES * NUM_ROLLS);
    for (let c = 0; c < NUM_CATEGORIES; c++) {
      for (let r = 0; r < NUM_ROLLS; r++) {
        this.baseNormal[c * NUM_ROLLS + r] = scoreCategory(c as Category, rolls[r], false);
        this.baseJoker[c * NUM_ROLLS + r] = scoreCategory(c as Category, rolls[r], true);
      }
    }

    this.isYahtzeeInt = new Int32Array(NUM_ROLLS);
    for (let r = 0; r < NUM_ROLLS; r++) this.isYahtzeeInt[r] = isYahtzee(rolls[r]) ? 1 : 0;

    this.yahHand = [];
    for (let f = 0; f < 6; f++) {
      const counts = [0, 0, 0, 0, 0, 0];
      counts[f] = 5;
      const idx = this.transitions.rollIndex.get(counts.join(","));
      if (idx === undefined) throw new Error(`missing five-of-a-kind hand for face ${f}`);
      this.yahHand.push(idx);
    }
  }

  stateIndex(mask: number, eligible: number, upper: number): number {
    return mask * 128 + eligible * 64 + upper;
  }

  /**
   * Best value of scoring an extra Yahtzee (five `face`s) under the Hasbro joker rule. The
   * Yahtzee box is already filled; the +100 bonus applies iff `elig`. Mirrors game_dp.py:83-113.
   */
  jokerBest(mask: number, elig: number, upper: number, face: number): number {
    const bonus = elig ? YAHTZEE_BONUS : 0;

    let legal: number[];
    if (!((mask >> face) & 1)) {
      legal = [face]; // matching upper box open -> forced there
    } else {
      const openLower: number[] = [];
      for (let c = 6; c < 13; c++) if (!((mask >> c) & 1)) openLower.push(c);
      if (openLower.length > 0) {
        legal = openLower; // free choice among open lower boxes
      } else {
        legal = []; // everything else filled -> forced 0 in an open upper box
        for (let c = 0; c < 6; c++) if (!((mask >> c) & 1)) legal.push(c);
      }
    }

    const hand = this.yahHand[face];
    let best = -Infinity;
    for (const c of legal) {
      const newMask = mask | (1 << c);
      const base = this.baseJoker[c * NUM_ROLLS + hand];
      let newUpper: number;
      let upBonus: number;
      if (c < 6) {
        newUpper = Math.min(UPPER_BONUS_THRESHOLD, upper + base);
        upBonus =
          upper < UPPER_BONUS_THRESHOLD && upper + base >= UPPER_BONUS_THRESHOLD
            ? UPPER_BONUS
            : 0;
      } else {
        newUpper = upper;
        upBonus = 0;
      }
      const reward = base + bonus + upBonus;
      const cand = reward + this.V[this.stateIndex(newMask, elig, newUpper)];
      if (cand > best) best = cand;
    }
    return best;
  }

  /** Expected value of one optimal turn from `(mask, elig, upper)`. Mirrors game_dp.py:116-149. */
  turnValue(
    mask: number,
    unused: number[],
    elig: number,
    upper: number,
    boxFilled: boolean,
  ): number {
    // Roll 3 (must score): value of each of the 252 final hands.
    const e3 = new Float64Array(NUM_ROLLS).fill(-Infinity);
    for (const c of unused) {
      const newMask = mask | (1 << c);
      const baseRow = c * NUM_ROLLS;
      if (c < 6) {
        // upper category
        for (let r = 0; r < NUM_ROLLS; r++) {
          const base = this.baseNormal[baseRow + r];
          const newUpper = Math.min(UPPER_BONUS_THRESHOLD, upper + base);
          const upBonus =
            upper < UPPER_BONUS_THRESHOLD && upper + base >= UPPER_BONUS_THRESHOLD
              ? UPPER_BONUS
              : 0;
          const child = newMask * 128 + elig * 64 + newUpper;
          const val = base + upBonus + this.V[child];
          if (val > e3[r]) e3[r] = val;
        }
      } else if (c === Category.YAHTZEE) {
        // only reachable while the box is open; eligibility becomes 1 iff this hand is a Yahtzee
        for (let r = 0; r < NUM_ROLLS; r++) {
          const base = this.baseNormal[baseRow + r];
          const child = newMask * 128 + this.isYahtzeeInt[r] * 64 + upper;
          const val = base + this.V[child];
          if (val > e3[r]) e3[r] = val;
        }
      } else {
        // lower, non-Yahtzee: child state is identical for every hand
        const vChild = this.V[this.stateIndex(newMask, elig, upper)];
        for (let r = 0; r < NUM_ROLLS; r++) {
          const val = this.baseNormal[baseRow + r] + vChild;
          if (val > e3[r]) e3[r] = val;
        }
      }
    }

    // Joker override: when the box is filled, an extra Yahtzee is a forced placement.
    if (boxFilled) {
      for (let face = 0; face < 6; face++) {
        e3[this.yahHand[face]] = this.jokerBest(mask, elig, upper, face);
      }
    }

    // Rolls 2 and 1: choose the keep set maximizing expected downstream value.
    const e2 = this.transitions.bestKeepValue(this.transitions.matvecT(e3));
    const e1 = this.transitions.bestKeepValue(this.transitions.matvecT(e2));
    return this.transitions.dot(this.transitions.rollProb, e1);
  }

  /** Convenience entry point: derives `unused` and `boxFilled` from the mask (solve() driver). */
  turnValueForState(mask: number, elig: number, upper: number): number {
    const unused: number[] = [];
    for (let c = 0; c < NUM_CATEGORIES; c++) if (!((mask >> c) & 1)) unused.push(c);
    const boxFilled = (mask & YAHTZEE_BIT) !== 0;
    return this.turnValue(mask, unused, elig, upper, boxFilled);
  }
}
