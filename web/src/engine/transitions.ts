/**
 * Reroll-transition helpers derived from the loaded tables. Mirrors `solver/transitions.py`.
 *
 * The canonical ROLLS/KEEPS ordering is imported from the data files (not regenerated), so it
 * cannot drift from Python. This module builds the index maps, the per-hand sub-keep structure
 * (the `np.maximum.reduceat` layout), and the two within-turn reductions.
 */

import { NUM_KEEPS, NUM_ROLLS, type Counts } from "./types.js";
import type { EngineData } from "./data.js";

function keyOf(counts: Counts): string {
  return counts.join(",");
}

function buildIndex(list: Counts[]): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < list.length; i++) m.set(keyOf(list[i]), i);
  return m;
}

function isSubMultiset(keep: Counts, roll: Counts): boolean {
  for (let f = 0; f < keep.length; f++) if (keep[f] > roll[f]) return false;
  return true;
}

export class Transitions {
  readonly rollIndex: Map<string, number>;
  readonly keepIndex: Map<string, number>;
  readonly emptyKeep = 0;
  /** Start offset into `subkeepFlat` for each roll (roll-outer, keep-inner order). */
  readonly subkeepStarts: Int32Array;
  /** Flattened keep indices that are sub-multisets of each roll. */
  readonly subkeepFlat: Int32Array;
  /** Initial-throw distribution over the 252 hands (= empty-keep row of T). */
  readonly rollProb: Float64Array;
  private readonly T: Float32Array;

  constructor(data: EngineData) {
    this.T = data.T;
    this.rollIndex = buildIndex(data.rolls);
    this.keepIndex = buildIndex(data.keeps);

    const flat: number[] = [];
    this.subkeepStarts = new Int32Array(NUM_ROLLS);
    for (let ri = 0; ri < NUM_ROLLS; ri++) {
      this.subkeepStarts[ri] = flat.length;
      const roll = data.rolls[ri];
      for (let ki = 0; ki < NUM_KEEPS; ki++) {
        if (isSubMultiset(data.keeps[ki], roll)) flat.push(ki);
      }
    }
    this.subkeepFlat = Int32Array.from(flat);

    this.rollProb = new Float64Array(NUM_ROLLS);
    const base = this.emptyKeep * NUM_ROLLS;
    for (let r = 0; r < NUM_ROLLS; r++) this.rollProb[r] = this.T[base + r];
  }

  /** `T @ e` : (462 x 252) · (252) -> (462). Per keep, expected downstream value. */
  matvecT(e: Float64Array): Float64Array {
    const out = new Float64Array(NUM_KEEPS);
    for (let k = 0; k < NUM_KEEPS; k++) {
      let acc = 0;
      const rowBase = k * NUM_ROLLS;
      for (let r = 0; r < NUM_ROLLS; r++) acc += this.T[rowBase + r] * e[r];
      out[k] = acc;
    }
    return out;
  }

  /**
   * For each of the 252 hands, the max `keepValues` over its sub-multiset keeps.
   * `keepValues` has length NUM_KEEPS; returns length NUM_ROLLS. Every hand has at least the
   * empty keep and itself as sub-keeps, so all segments are non-empty.
   */
  bestKeepValue(keepValues: Float64Array): Float64Array {
    const out = new Float64Array(NUM_ROLLS);
    const flat = this.subkeepFlat;
    for (let ri = 0; ri < NUM_ROLLS; ri++) {
      const start = this.subkeepStarts[ri];
      const end = ri + 1 < NUM_ROLLS ? this.subkeepStarts[ri + 1] : flat.length;
      let m = -Infinity;
      for (let j = start; j < end; j++) {
        const v = keepValues[flat[j]];
        if (v > m) m = v;
      }
      out[ri] = m;
    }
    return out;
  }

  /**
   * Argmax companion to `bestKeepValue`: for each hand, the keep index attaining the segment
   * max of `keepValues`. Strict `>` keeps the first (lowest) keep index on ties, matching the
   * Python `_best_keep_arg` (`solver/findings.py`). Returns length NUM_ROLLS.
   */
  bestKeepArg(keepValues: Float64Array): Int32Array {
    const out = new Int32Array(NUM_ROLLS);
    const flat = this.subkeepFlat;
    for (let ri = 0; ri < NUM_ROLLS; ri++) {
      const start = this.subkeepStarts[ri];
      const end = ri + 1 < NUM_ROLLS ? this.subkeepStarts[ri + 1] : flat.length;
      let m = -Infinity;
      let arg = flat[start];
      for (let j = start; j < end; j++) {
        const v = keepValues[flat[j]];
        if (v > m) {
          m = v;
          arg = flat[j];
        }
      }
      out[ri] = arg;
    }
    return out;
  }

  /** Dot product of two equal-length vectors (used for `rollProb · e1`). */
  dot(a: Float64Array, b: Float64Array): number {
    let acc = 0;
    for (let i = 0; i < a.length; i++) acc += a[i] * b[i];
    return acc;
  }
}
