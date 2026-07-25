/**
 * Scorecard input model → engine `TurnState`.
 *
 * The engine only needs `(mask, eligible, upper)`. We derive `upper` from the actual number of
 * matching dice the user booked in each upper box (not a free slider), so every constructed
 * state is genuinely reachable and its V lookups are never NaN.
 */

import {
  Category,
  UPPER_BONUS_THRESHOLD,
  YAHTZEE_BIT,
  type TurnState,
} from "../../engine/index.js";

/** Upper categories, index === face value − 1 === Category index. */
export const UPPER_CATS = [0, 1, 2, 3, 4, 5] as const;
/** Lower categories excluding Yahtzee (which has its own eligibility state). */
export const LOWER_CATS = [
  Category.THREE_OF_A_KIND,
  Category.FOUR_OF_A_KIND,
  Category.FULL_HOUSE,
  Category.SMALL_STRAIGHT,
  Category.LARGE_STRAIGHT,
  Category.CHANCE,
] as const;

export type YahtzeeStatus = "open" | "zero" | "fifty";

export interface Scorecard {
  /** Per upper box: null = open, else count 0..5 of that face booked there. */
  upper: (number | null)[];
  /** Per LOWER_CATS entry: filled? */
  lower: boolean[];
  yahtzee: YahtzeeStatus;
}

export function emptyScorecard(): Scorecard {
  return {
    upper: [null, null, null, null, null, null],
    lower: [false, false, false, false, false, false],
    yahtzee: "open",
  };
}

export function deriveTurnState(card: Scorecard): TurnState {
  let mask = 0;
  let upper = 0;
  for (let i = 0; i < UPPER_CATS.length; i++) {
    const count = card.upper[i];
    if (count !== null) {
      mask |= 1 << i;
      upper += count * (i + 1);
    }
  }
  LOWER_CATS.forEach((cat, idx) => {
    if (card.lower[idx]) mask |= 1 << cat;
  });
  if (card.yahtzee !== "open") mask |= YAHTZEE_BIT;

  const eligible: 0 | 1 = card.yahtzee === "fifty" ? 1 : 0;
  return { mask, eligible, upper: Math.min(upper, UPPER_BONUS_THRESHOLD) };
}

export function categoriesRemaining(card: Scorecard): number {
  let filled = 0;
  for (const c of card.upper) if (c !== null) filled++;
  for (const f of card.lower) if (f) filled++;
  if (card.yahtzee !== "open") filled++;
  return 13 - filled;
}

export const CATEGORY_LABEL: Record<number, string> = {
  [Category.ACES]: "Aces",
  [Category.TWOS]: "Twos",
  [Category.THREES]: "Threes",
  [Category.FOURS]: "Fours",
  [Category.FIVES]: "Fives",
  [Category.SIXES]: "Sixes",
  [Category.THREE_OF_A_KIND]: "Three of a Kind",
  [Category.FOUR_OF_A_KIND]: "Four of a Kind",
  [Category.FULL_HOUSE]: "Full House",
  [Category.SMALL_STRAIGHT]: "Small Straight",
  [Category.LARGE_STRAIGHT]: "Large Straight",
  [Category.YAHTZEE]: "Yahtzee",
  [Category.CHANCE]: "Chance",
};
