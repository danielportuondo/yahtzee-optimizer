/**
 * Play model for the 13-turn game + vs-optimal grading. Pure (no React, no RNG).
 *
 * Every decision is graded against the engine's optimum: `evLost = best.ev − chosen.ev`, the
 * expected final points the choice gave up. The board state is advanced by re-deriving the engine
 * `TurnState` from the reused `Scorecard` (via `deriveTurnState`), which keeps every mid-game state
 * on the reachable manifold so V lookups never go NaN. Grand total is `Σ` of each turn's booked
 * `CategoryOption.score` (base + any +35/+100 bonus awarded that turn) — the single source of truth.
 */

import {
  Category,
  GameEngine,
  isYahtzee,
  scoreCategory,
  UPPER_BONUS,
  UPPER_BONUS_THRESHOLD,
  type Counts,
} from "../../engine/index.js";
import {
  deriveTurnState,
  emptyScorecard,
  LOWER_CATS,
  type Scorecard,
} from "../turn-optimizer/scorecard.js";

export type DecisionKind = "keep" | "score";

/** One graded decision (a keep on roll 1/2, or a category assignment). */
export interface Grade {
  decision: DecisionKind;
  rollNumber: 1 | 2 | 3;
  /** Set for "score" decisions. */
  category?: Category;
  /** `best.ev − chosen.ev`, clamped ≥ 0 — expected points left on the table by this choice. */
  evLost: number;
}

/** A category booked this game. */
export interface Booking {
  category: Category;
  /** Base category points (no bonus) — what the scorecard cell shows. */
  base: number;
  /** Points booked this turn incl. any +35/+100 bonus — the running-total unit. */
  total: number;
  /** The hand booked, as face counts. */
  hand: Counts;
  /** Roll the category was assigned on (1/2/3). */
  rollNumber: 1 | 2 | 3;
}

export interface PlayState {
  /** Reused turn-optimizer model; drives `deriveTurnState`. */
  card: Scorecard;
  /** Indexed by `Category` (length 13); null = still open. */
  bookings: (Booking | null)[];
  /** How many categories are booked (0..13). */
  turnIndex: number;
  /** Σ booking.total — the authoritative grand total. */
  runningScore: number;
  /** Every graded decision, in order. */
  grades: Grade[];
}

export function emptyPlay(): PlayState {
  return {
    card: emptyScorecard(),
    bookings: Array<Booking | null>(13).fill(null),
    turnIndex: 0,
    runningScore: 0,
    grades: [],
  };
}

export function isGameOver(play: PlayState): boolean {
  return play.turnIndex >= 13;
}

/** Face-count multiset from an ordered dice array. */
export function countsFromDice(dice: number[]): Counts {
  const counts = [0, 0, 0, 0, 0, 0];
  for (const d of dice) counts[d - 1]++;
  return counts;
}

function countsFromHeld(dice: number[], held: Set<number>): Counts {
  const counts = [0, 0, 0, 0, 0, 0];
  for (const i of held) counts[dice[i] - 1]++;
  return counts;
}

function sameCounts(a: Counts, b: Counts): boolean {
  for (let f = 0; f < 6; f++) if (a[f] !== b[f]) return false;
  return true;
}

/** Whether the Hasbro joker wildcard applies for `category` given this hand and card. */
function jokerActiveFor(card: Scorecard, category: Category, handCounts: Counts): boolean {
  // Mirrors the engine's box-*filled* gate: a Yahtzee box scored 0 still grants the wildcard
  // (Full House / straights pay fixed values), just no +100 bonus.
  return isYahtzee(handCounts) && card.yahtzee !== "open" && category !== Category.YAHTZEE;
}

function bookIntoCard(
  card: Scorecard,
  category: Category,
  handCounts: Counts,
  base: number,
): Scorecard {
  const next: Scorecard = {
    upper: card.upper.slice(),
    lower: card.lower.slice(),
    yahtzee: card.yahtzee,
  };
  if (category <= Category.SIXES) {
    // Store the count of that face — this reproduces the engine's newUpper exactly, including
    // count=5 for a joker Yahtzee forced into an upper box and count=0 for a forced-zero.
    next.upper[category] = handCounts[category];
  } else if (category === Category.YAHTZEE) {
    next.yahtzee = base === 50 ? "fifty" : "zero";
  } else {
    const idx = LOWER_CATS.indexOf(category as (typeof LOWER_CATS)[number]);
    if (idx < 0) throw new Error(`not a lower category: ${category}`);
    next.lower[idx] = true;
  }
  return next;
}

/**
 * Book `category` with the current hand, grade the decision, and advance the game. Pure — returns
 * a new `PlayState`. `rollNumber` is the roll the player scored on (early scoring is allowed).
 */
export function applyBooking(
  play: PlayState,
  category: Category,
  dice: number[],
  rollNumber: 1 | 2 | 3,
  engine: GameEngine,
): PlayState {
  const handCounts = countsFromDice(dice);
  const state = deriveTurnState(play.card);

  // Authoritative points booked this turn (base + bonuses) come from the roll-3 evaluation of
  // these dice — valid regardless of which roll the player actually scored on.
  const scoreRec = engine.recommend(state, dice, 3);
  if (scoreRec.kind !== "score") throw new Error("expected a score recommendation");
  const opt = scoreRec.alternatives.find((a) => a.category === category);
  if (!opt) throw new Error(`category ${category} is not open`);

  // Optimal baseline: on rolls 1/2 the true optimum is the best *keep* (keeping all five weakly
  // dominates scoring now), so grading early scores against the roll-3 best would understate loss.
  const baseline =
    rollNumber === 3 ? scoreRec.best.ev : engine.recommend(state, dice, rollNumber).best.ev;
  const evLost = Math.max(0, baseline - opt.ev);

  const jokerActive = jokerActiveFor(play.card, category, handCounts);
  const base = scoreCategory(category, handCounts, jokerActive);

  const bookings = play.bookings.slice();
  bookings[category] = { category, base, total: opt.score, hand: handCounts, rollNumber };

  return {
    card: bookIntoCard(play.card, category, handCounts, base),
    bookings,
    turnIndex: play.turnIndex + 1,
    runningScore: play.runningScore + opt.score,
    grades: [...play.grades, { decision: "score", rollNumber, category, evLost }],
  };
}

/**
 * Grade a keep decision (roll 1/2): find the player's held multiset among the ranked keep
 * alternatives and return `best.ev − chosen.ev`. The empty and full sub-keeps are always present,
 * so any physical hold-set matches; matching is on the multiset, so duplicate faces are fine.
 */
export function gradeKeep(
  play: PlayState,
  dice: number[],
  held: Set<number>,
  rollNumber: 1 | 2,
  engine: GameEngine,
): Grade {
  const rec = engine.recommend(deriveTurnState(play.card), dice, rollNumber);
  if (rec.kind !== "keep") throw new Error("expected a keep recommendation");
  const keep = countsFromHeld(dice, held);
  const chosen = rec.alternatives.find((o) => sameCounts(o.keep, keep));
  if (!chosen) throw new Error("held set not found among keep alternatives");
  return {
    decision: "keep",
    rollNumber,
    evLost: Math.max(0, rec.best.ev - chosen.ev),
  };
}

/** Total expected points left on the table across every graded decision. */
export function totalEvLost(play: PlayState): number {
  return play.grades.reduce((s, g) => s + g.evLost, 0);
}

/**
 * Score breakdown for display. Grand total is `runningScore` (= Σ booking.total); the section
 * rows are derived so they always reconcile to it — the Yahtzee bonus is backed out as the
 * residual, never added on top.
 */
export interface ScoreBreakdown {
  upperSubtotal: number;
  upperBonus: number;
  upperTotal: number;
  lowerBase: number;
  yahtzeeBonus: number;
  grandTotal: number;
}

export function scoreBreakdown(play: PlayState): ScoreBreakdown {
  let upperSubtotal = 0;
  let allBase = 0;
  for (const b of play.bookings) {
    if (!b) continue;
    allBase += b.base;
    if (b.category <= Category.SIXES) upperSubtotal += b.base;
  }
  const upperBonus = upperSubtotal >= UPPER_BONUS_THRESHOLD ? UPPER_BONUS : 0;
  const yahtzeeBonus = play.runningScore - allBase - upperBonus;
  return {
    upperSubtotal,
    upperBonus,
    upperTotal: upperSubtotal + upperBonus,
    lowerBase: allBase - upperSubtotal,
    yahtzeeBonus,
    grandTotal: play.runningScore,
  };
}

export interface GameGrade {
  letter: string;
  label: string;
}

/** Bucket total EV lost into a letter grade. Optimal play loses ~0. */
export function finalGrade(evLost: number): GameGrade {
  if (evLost < 1) return { letter: "S", label: "Near-optimal play" };
  if (evLost < 5) return { letter: "A", label: "Excellent decisions" };
  if (evLost < 12) return { letter: "B", label: "Solid play" };
  if (evLost < 25) return { letter: "C", label: "Room to sharpen" };
  if (evLost < 45) return { letter: "D", label: "Leaky decisions" };
  return { letter: "F", label: "Trust the optimizer next time" };
}
