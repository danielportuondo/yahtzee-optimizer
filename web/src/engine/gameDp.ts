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
  HAND_SIZE,
  NUM_CATEGORIES,
  NUM_FACES,
  NUM_ROLLS,
  UPPER_BONUS,
  UPPER_BONUS_THRESHOLD,
  YAHTZEE_BIT,
  YAHTZEE_BONUS,
  type Counts,
} from "./types.js";
import type { EngineData } from "./data.js";
import { Transitions } from "./transitions.js";
import { isYahtzee, scoreCategory } from "./scoring.js";
import type {
  CategoryOption,
  KeepOption,
  OpeningKeep,
  Recommendation,
  TurnState,
} from "./recommend.js";

function countsFromDice(dice: number[]): Counts {
  const counts = [0, 0, 0, 0, 0, 0];
  for (const d of dice) {
    if (d < 1 || d > NUM_FACES) throw new Error(`die face out of range: ${d}`);
    counts[d - 1]++;
  }
  return counts;
}

/** Which physical dice to hold to realize a keep multiset (same-face dice interchangeable). */
function mapKeepToDice(keep: Counts, dice: number[]): number[] {
  const need = keep.slice();
  const held: number[] = [];
  for (let i = 0; i < dice.length; i++) {
    const f = dice[i] - 1;
    if (need[f] > 0) {
      held.push(i);
      need[f]--;
    }
  }
  return held;
}

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
   * Per-category options for scoring an extra Yahtzee (five `face`s) under the Hasbro joker
   * rule. The Yahtzee box is already filled; the +100 bonus applies iff `elig`. The legal
   * placement set follows game_dp.py:83-113. `score` is the points booked this turn.
   */
  private jokerOptions(
    mask: number,
    elig: number,
    upper: number,
    face: number,
  ): CategoryOption[] {
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
    const options: CategoryOption[] = [];
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
      const ev = reward + this.V[this.stateIndex(newMask, elig, newUpper)];
      options.push({ category: c as Category, score: reward, ev });
    }
    return options;
  }

  /**
   * Best value of scoring an extra Yahtzee (five `face`s) under the Hasbro joker rule.
   * Mirrors game_dp.py:83-113 (the max over `jokerOptions`).
   */
  jokerBest(mask: number, elig: number, upper: number, face: number): number {
    let best = -Infinity;
    for (const o of this.jokerOptions(mask, elig, upper, face)) {
      if (o.ev > best) best = o.ev;
    }
    return best;
  }

  /**
   * Roll-3 must-score value of each of the 252 final hands (the DP's `e3`): for every hand,
   * the best `immediate_score(cat) + V(next state)` over the open categories. Mirrors the
   * `e3` construction of game_dp.py:122-163, incl. the box-filled joker override.
   */
  private computeE3(
    mask: number,
    unused: number[],
    elig: number,
    upper: number,
    boxFilled: boolean,
  ): Float64Array {
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
    return e3;
  }

  /**
   * The within-turn DP intermediates for one state. `keepValues3` / `keepValues2` are the
   * per-keep expected values that drive the roll-2 / roll-1 keep decisions; `e1` is the
   * per-hand value at the start of the turn. `turnValue` and `recommend` share this.
   */
  private turnArrays(
    mask: number,
    unused: number[],
    elig: number,
    upper: number,
    boxFilled: boolean,
  ): {
    keepValues3: Float64Array;
    keepValues2: Float64Array;
    e1: Float64Array;
  } {
    const e3 = this.computeE3(mask, unused, elig, upper, boxFilled);
    const keepValues3 = this.transitions.matvecT(e3);
    const e2 = this.transitions.bestKeepValue(keepValues3);
    const keepValues2 = this.transitions.matvecT(e2);
    const e1 = this.transitions.bestKeepValue(keepValues2);
    return { keepValues3, keepValues2, e1 };
  }

  /** Expected value of one optimal turn from `(mask, elig, upper)`. Mirrors game_dp.py:116-149. */
  turnValue(
    mask: number,
    unused: number[],
    elig: number,
    upper: number,
    boxFilled: boolean,
  ): number {
    const { e1 } = this.turnArrays(mask, unused, elig, upper, boxFilled);
    return this.transitions.dot(this.transitions.rollProb, e1);
  }

  /** Convenience entry point: derives `unused` and `boxFilled` from the mask (solve() driver). */
  turnValueForState(mask: number, elig: number, upper: number): number {
    const unused: number[] = [];
    for (let c = 0; c < NUM_CATEGORIES; c++) if (!((mask >> c) & 1)) unused.push(c);
    const boxFilled = (mask & YAHTZEE_BIT) !== 0;
    return this.turnValue(mask, unused, elig, upper, boxFilled);
  }

  /**
   * The optimal roll-1 keep for every one of the 252 opening hands of `state`, computed with a
   * single within-turn solve (the batch mirror of `_make_policy` in `solver/findings.py`).
   * Each `ev` equals `recommend(state, hand, 1).best.ev` by construction — roll 1 selects from
   * `keepValues2` — so a per-hand `recommend` call here would only redo the same turn solve 252×.
   */
  openingPolicy(state: TurnState): OpeningKeep[] {
    const { mask, eligible, upper } = state;
    const unused: number[] = [];
    for (let c = 0; c < NUM_CATEGORIES; c++) if (!((mask >> c) & 1)) unused.push(c);
    const boxFilled = (mask & YAHTZEE_BIT) !== 0;
    const { keepValues2 } = this.turnArrays(mask, unused, eligible, upper, boxFilled);
    const keep1 = this.transitions.bestKeepArg(keepValues2);
    const out: OpeningKeep[] = [];
    for (let h = 0; h < NUM_ROLLS; h++) {
      const keepIndex = keep1[h];
      const keptCounts = this.data.keeps[keepIndex];
      let held = 0;
      for (const n of keptCounts) held += n;
      out.push({ handIndex: h, keepIndex, keptCounts, held, ev: keepValues2[keepIndex] });
    }
    return out;
  }

  /** Per-category scoring options for a specific final hand on roll 3 (must score). */
  private scoreOptionsForHand(
    mask: number,
    elig: number,
    upper: number,
    unused: number[],
    boxFilled: boolean,
    handIdx: number,
  ): CategoryOption[] {
    // A box-filled extra Yahtzee is a forced/joker placement — the legal set differs.
    if (boxFilled) {
      for (let face = 0; face < NUM_FACES; face++) {
        if (this.yahHand[face] === handIdx) {
          return this.jokerOptions(mask, elig, upper, face);
        }
      }
    }

    const options: CategoryOption[] = [];
    for (const c of unused) {
      const newMask = mask | (1 << c);
      const base = this.baseNormal[c * NUM_ROLLS + handIdx];
      if (c < 6) {
        const newUpper = Math.min(UPPER_BONUS_THRESHOLD, upper + base);
        const upBonus =
          upper < UPPER_BONUS_THRESHOLD && upper + base >= UPPER_BONUS_THRESHOLD
            ? UPPER_BONUS
            : 0;
        const ev = base + upBonus + this.V[this.stateIndex(newMask, elig, newUpper)];
        options.push({ category: c as Category, score: base + upBonus, ev });
      } else if (c === Category.YAHTZEE) {
        const ev = base + this.V[this.stateIndex(newMask, this.isYahtzeeInt[handIdx], upper)];
        options.push({ category: c as Category, score: base, ev });
      } else {
        const ev = base + this.V[this.stateIndex(newMask, elig, upper)];
        options.push({ category: c as Category, score: base, ev });
      }
    }
    return options;
  }

  /**
   * Optimal move for `dice` (ordered face values 1..6) at `rollNumber`, with ranked
   * alternatives and expected additional scores. Rolls 1/2 advise a keep set; roll 3 advises
   * a category. Pure and cheap (sub-millisecond) — safe to call live on every change.
   */
  recommend(state: TurnState, dice: number[], rollNumber: 1 | 2 | 3): Recommendation {
    if (dice.length !== HAND_SIZE) throw new Error(`dice must have ${HAND_SIZE} values`);
    const counts = countsFromDice(dice);
    const handIdx = this.transitions.rollIndex.get(counts.join(","));
    if (handIdx === undefined) throw new Error(`invalid dice: ${dice.join(",")}`);

    const { mask, eligible, upper } = state;
    const unused: number[] = [];
    for (let c = 0; c < NUM_CATEGORIES; c++) if (!((mask >> c) & 1)) unused.push(c);
    const boxFilled = (mask & YAHTZEE_BIT) !== 0;

    if (rollNumber === 3) {
      const alternatives = this.scoreOptionsForHand(
        mask,
        eligible,
        upper,
        unused,
        boxFilled,
        handIdx,
      );
      alternatives.sort((a, b) => b.ev - a.ev);
      return { kind: "score", rollNumber, best: alternatives[0], alternatives, ev: alternatives[0].ev };
    }

    const { keepValues3, keepValues2 } = this.turnArrays(mask, unused, eligible, upper, boxFilled);
    const keepValues = rollNumber === 2 ? keepValues3 : keepValues2;
    const t = this.transitions;
    const start = t.subkeepStarts[handIdx];
    const end = handIdx + 1 < NUM_ROLLS ? t.subkeepStarts[handIdx + 1] : t.subkeepFlat.length;
    const alternatives: KeepOption[] = [];
    for (let j = start; j < end; j++) {
      const k = t.subkeepFlat[j];
      const keep = this.data.keeps[k];
      alternatives.push({ keep, heldDiceIndices: mapKeepToDice(keep, dice), ev: keepValues[k] });
    }
    alternatives.sort((a, b) => b.ev - a.ev);
    return { kind: "keep", rollNumber, best: alternatives[0], alternatives, ev: alternatives[0].ev };
  }
}
