/**
 * Per-category Yahtzee scoring — pure and state-free. Verbatim port of `solver/scoring.py`.
 *
 * `scoreCategory` returns only the base category points. The two state-dependent bonuses
 * (the +35 upper bonus and the +100 Yahtzee bonus) are applied by the game DP, not here.
 *
 * `jokerActive` covers the Hasbro joker rule: a Yahtzee (5 of a kind) scored as a wildcard in
 * Full House / Small Straight / Large Straight awards those fixed values even though a
 * five-of-a-kind is not literally a full house or straight.
 */

import { Category, type Counts } from "./types.js";

// Straight runs, as sets of face *indices* (mirrors scoring.py:43-44).
const SMALL_STRAIGHTS: ReadonlyArray<ReadonlySet<number>> = [
  new Set([0, 1, 2, 3]),
  new Set([1, 2, 3, 4]),
  new Set([2, 3, 4, 5]),
];
const LARGE_STRAIGHTS: ReadonlyArray<ReadonlySet<number>> = [
  new Set([0, 1, 2, 3, 4]),
  new Set([1, 2, 3, 4, 5]),
];

/** Total pip count of the hand. */
export function sumOfDice(counts: Counts): number {
  let total = 0;
  for (let f = 0; f < counts.length; f++) total += (f + 1) * counts[f];
  return total;
}

export function isYahtzee(counts: Counts): boolean {
  return counts.includes(5);
}

function isFullHouse(counts: Counts): boolean {
  return counts.includes(3) && counts.includes(2);
}

function present(counts: Counts): Set<number> {
  const s = new Set<number>();
  for (let f = 0; f < counts.length; f++) if (counts[f] > 0) s.add(f);
  return s;
}

function subsetOf(run: ReadonlySet<number>, of: Set<number>): boolean {
  for (const x of run) if (!of.has(x)) return false;
  return true;
}

function maxCount(counts: Counts): number {
  let m = 0;
  for (const n of counts) if (n > m) m = n;
  return m;
}

/**
 * Base points for scoring `cat` with `counts`. `jokerActive` (a Yahtzee played under the
 * joker rule) lets Full House / Small Straight / Large Straight pay their fixed values.
 */
export function scoreCategory(cat: Category, counts: Counts, jokerActive = false): number {
  const jokerYahtzee = jokerActive && isYahtzee(counts);

  switch (cat) {
    case Category.ACES:
    case Category.TWOS:
    case Category.THREES:
    case Category.FOURS:
    case Category.FIVES:
    case Category.SIXES:
      return counts[cat] * (cat + 1);

    case Category.THREE_OF_A_KIND:
      return maxCount(counts) >= 3 ? sumOfDice(counts) : 0;

    case Category.FOUR_OF_A_KIND:
      return maxCount(counts) >= 4 ? sumOfDice(counts) : 0;

    case Category.FULL_HOUSE:
      return isFullHouse(counts) || jokerYahtzee ? 25 : 0;

    case Category.SMALL_STRAIGHT: {
      const p = present(counts);
      const hasRun = SMALL_STRAIGHTS.some((run) => subsetOf(run, p));
      return hasRun || jokerYahtzee ? 30 : 0;
    }

    case Category.LARGE_STRAIGHT: {
      const p = present(counts);
      const hasRun = LARGE_STRAIGHTS.some((run) => subsetOf(run, p));
      return hasRun || jokerYahtzee ? 40 : 0;
    }

    case Category.YAHTZEE:
      return isYahtzee(counts) ? 50 : 0;

    case Category.CHANCE:
      return sumOfDice(counts);

    default:
      throw new Error(`unknown category: ${cat}`);
  }
}
