/**
 * Types for the turn-recommendation surface (`GameEngine.recommend`).
 *
 * The recommendation layer adds no DP math: it retains the intermediate arrays that
 * `turnValue` already computes (and that are cross-checked against Python) and turns them
 * into a ranked, UI-ready policy — which dice to hold on rolls 1/2, which category to score
 * on roll 3, each with its expected additional score.
 */

import type { Category, Counts } from "./types.js";

/** The scorecard position a turn is played from. `upper` is the subtotal capped at 63. */
export interface TurnState {
  /** 13-bit category-filled bitmask. */
  mask: number;
  /** 1 iff the Yahtzee box already holds 50 (so extra Yahtzees earn +100). */
  eligible: 0 | 1;
  /** Upper-section subtotal so far, 0..63 (values ≥63 behave identically). */
  upper: number;
}

/** One keep choice on roll 1 or 2. */
export interface KeepOption {
  /** Keep multiset (length-6 face counts). */
  keep: Counts;
  /** Which of the input `dice` to hold (indices into the ordered roll). */
  heldDiceIndices: number[];
  /** Expected additional score from optimal play after committing this keep. */
  ev: number;
}

/** One scoring choice on roll 3 (must score). */
export interface CategoryOption {
  category: Category;
  /** Points booked this turn: base + any upper/Yahtzee bonus awarded now. */
  score: number;
  /** `score` + V(next state): expected additional score for the rest of the game. */
  ev: number;
}

/** Best move for the current roll, with ranked alternatives so the "why" is visible. */
export type Recommendation =
  | {
      kind: "keep";
      rollNumber: 1 | 2;
      best: KeepOption;
      /** All legal keeps for this hand, sorted by `ev` descending (includes `best`). */
      alternatives: KeepOption[];
      /** Convenience alias for `best.ev`. */
      ev: number;
    }
  | {
      kind: "score";
      rollNumber: 3;
      best: CategoryOption;
      /** All legal categories for this hand, sorted by `ev` descending (includes `best`). */
      alternatives: CategoryOption[];
      /** Convenience alias for `best.ev`. */
      ev: number;
    };
