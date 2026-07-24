/**
 * Shared types and constants for the within-turn engine.
 *
 * A *hand* (and a *keep*) is `counts`: a length-6 array where `counts[f]` is the number of
 * dice showing face `f + 1`. `sum(counts) === 5` for a full roll. Face `f` maps to index `f`.
 * This mirrors the Python solver (`solver/scoring.py`, `solver/transitions.py`); the enum
 * indices below are pinned by `web/public/data/manifest.json`'s `categories` map.
 */

/** Face-count multiset (length 6). */
export type Counts = number[];

export enum Category {
  ACES = 0,
  TWOS = 1,
  THREES = 2,
  FOURS = 3,
  FIVES = 4,
  SIXES = 5,
  THREE_OF_A_KIND = 6,
  FOUR_OF_A_KIND = 7,
  FULL_HOUSE = 8,
  SMALL_STRAIGHT = 9,
  LARGE_STRAIGHT = 10,
  YAHTZEE = 11,
  CHANCE = 12,
}

export const NUM_FACES = 6;
export const HAND_SIZE = 5;
export const NUM_CATEGORIES = 13;
export const NUM_ROLLS = 252;
export const NUM_KEEPS = 462;

export const FULL_MASK = (1 << NUM_CATEGORIES) - 1; // 8191
export const YAHTZEE_BIT = 1 << Category.YAHTZEE; // 2048

// Bonuses are applied by the game DP, not by scoreCategory (mirrors game_dp.py:41-43).
export const UPPER_BONUS_THRESHOLD = 63;
export const UPPER_BONUS = 35;
export const YAHTZEE_BONUS = 100;

// V state-index strides (index = mask * 128 + eligible * 64 + upper).
export const MASK_STRIDE = 128;
export const ELIGIBLE_STRIDE = 64;
export const STATE_COUNT = (1 << NUM_CATEGORIES) * MASK_STRIDE; // 1,048,576
