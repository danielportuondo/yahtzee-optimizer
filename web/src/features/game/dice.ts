/**
 * Dice rolling for the playable game — the only module that uses randomness.
 *
 * Kept apart from `gameState.ts` (the pure grading/transition logic) so tests can drive a game
 * with fixed hands and never touch the RNG. Callers must invoke these from event handlers only
 * (never in render/effect) so React StrictMode's double-invoke can't reroll behind the player.
 */

import { HAND_SIZE, NUM_FACES } from "../../engine/index.js";

function rollFace(): number {
  return 1 + Math.floor(Math.random() * NUM_FACES);
}

/** A fresh roll of all five dice (start of a turn). */
export function initialRoll(): number[] {
  return Array.from({ length: HAND_SIZE }, rollFace);
}

/**
 * Reroll only the dice whose index is NOT in `held`, preserving order and length. Positions are
 * stable so held indices stay aligned with `recommend`'s `heldDiceIndices`. Never re-sort.
 */
export function rollDice(prev: number[], held: Set<number>): number[] {
  return prev.map((v, i) => (held.has(i) ? v : rollFace()));
}
