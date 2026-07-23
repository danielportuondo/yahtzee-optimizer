"""Two-level dynamic program for optimal solitaire Yahtzee (§3.2 / §3.3).

A game state is ``(mask, eligible, upper)``:

- ``mask``     — 13-bit set of filled categories.
- ``eligible`` — 1 if the Yahtzee box holds 50 (so future Yahtzees earn the +100 bonus),
  else 0. Only meaningful once the Yahtzee box is filled.
- ``upper``    — upper-section subtotal capped at 63 (0..63).

``V(state)`` = expected additional score under optimal play. It is computed by backward
induction over the category mask (fully-filled card has ``V = 0``); each state's value is
the expected result of one optimal turn (the within-turn DP) whose leaves look up ``V`` of
states with one more category filled. ``V`` of the empty card is the optimal expected game
score (the ≈254.59 benchmark).

Flat index: ``mask * 128 + eligible * 64 + upper``.

Bonuses handled here (not in ``scoring``): the +35 upper bonus is awarded the turn the
subtotal crosses 63; the +100 Yahtzee bonus is awarded whenever an extra Yahtzee is scored
while ``eligible``. The Hasbro joker rule constrains where an extra Yahtzee may be placed.
"""

from __future__ import annotations

import numpy as np

from solver import scoring
from solver.scoring import Category
from solver.transitions import (
    NUM_ROLLS,
    ROLL_INDEX,
    ROLLS,
    T,
    best_keep_value,
    roll_prob,
)

NUM_CATEGORIES = 13
FULL_MASK = (1 << NUM_CATEGORIES) - 1
YAHTZEE_BIT = 1 << int(Category.YAHTZEE)
UPPER_BONUS_THRESHOLD = 63
UPPER_BONUS = 35
YAHTZEE_BONUS = 100

# ---- precomputed per-(category, hand) tables --------------------------------------------

_base_normal = np.zeros((NUM_CATEGORIES, NUM_ROLLS), dtype=np.int64)
_base_joker = np.zeros((NUM_CATEGORIES, NUM_ROLLS), dtype=np.int64)
for _c in range(NUM_CATEGORIES):
    for _r, _hand in enumerate(ROLLS):
        _base_normal[_c, _r] = scoring.score_category(_c, _hand, joker_active=False)
        _base_joker[_c, _r] = scoring.score_category(_c, _hand, joker_active=True)

_is_yahtzee_hand = np.array([scoring.is_yahtzee(h) for h in ROLLS], dtype=bool)
_is_yahtzee_int = _is_yahtzee_hand.astype(np.int64)

# roll index of each five-of-a-kind hand, indexed by face 0..5
_YAH_HAND = [ROLL_INDEX[tuple(5 if i == f else 0 for i in range(6))] for f in range(6)]

_MASKS_BY_POPCOUNT: list[list[int]] = [[] for _ in range(NUM_CATEGORIES + 1)]
for _m in range(1 << NUM_CATEGORIES):
    _MASKS_BY_POPCOUNT[_m.bit_count()].append(_m)


def state_index(mask: int, eligible: int, upper: int) -> int:
    return mask * 128 + eligible * 64 + upper


def _reachable_uppers(mask: int) -> list[int]:
    """Upper subtotals (capped at 63) reachable from the filled upper categories."""
    reach = {0}
    for c in range(6):
        if (mask >> c) & 1:
            face = c + 1
            reach = {
                min(UPPER_BONUS_THRESHOLD, s + n * face)
                for s in reach
                for n in range(6)  # 0..5 dice of this face
            }
    return sorted(reach)


def _joker_best(V: np.ndarray, mask: int, elig: int, upper: int, face: int) -> float:
    """Best value of scoring an extra Yahtzee (five ``face``s) under the joker rule.

    The Yahtzee box is already filled. Placement is forced by the Hasbro joker rule; the
    +100 bonus applies iff ``elig``.
    """
    bonus = YAHTZEE_BONUS if elig else 0
    if not (mask >> face) & 1:  # matching upper box open -> forced there
        legal = (face,)
    else:
        open_lower = [c for c in range(6, 13) if not (mask >> c) & 1]
        if open_lower:  # any open lower box (Yahtzee box already filled)
            legal = open_lower
        else:  # everything else filled -> forced 0 in an open upper box
            legal = [c for c in range(6) if not (mask >> c) & 1]

    hand = _YAH_HAND[face]
    best = -np.inf
    for c in legal:
        new_mask = mask | (1 << c)
        base = int(_base_joker[c, hand])
        if c < 6:  # upper box
            new_upper = min(UPPER_BONUS_THRESHOLD, upper + base)
            up_bonus = UPPER_BONUS if (upper < UPPER_BONUS_THRESHOLD <= upper + base) else 0
        else:  # lower box (never the Yahtzee box here — it is filled)
            new_upper = upper
            up_bonus = 0
        reward = base + bonus + up_bonus
        cand = reward + V[state_index(new_mask, elig, new_upper)]
        best = max(best, cand)
    return float(best)


def _turn_value(
    V: np.ndarray, mask: int, unused: list[int], elig: int, upper: int, box_filled: bool
) -> float:
    """Expected value of one optimal turn from ``(mask, elig, upper)``."""
    # Roll 3 (must score): value of each of the 252 final hands.
    e3 = np.full(NUM_ROLLS, -np.inf)
    for c in unused:
        new_mask = mask | (1 << c)
        base = _base_normal[c]
        if c < 6:  # upper category
            new_upper = np.minimum(UPPER_BONUS_THRESHOLD, upper + base)
            up_bonus = np.where(
                (upper < UPPER_BONUS_THRESHOLD) & (upper + base >= UPPER_BONUS_THRESHOLD),
                UPPER_BONUS,
                0,
            )
            child = new_mask * 128 + elig * 64 + new_upper
            val = base + up_bonus + V[child]
        elif c == int(Category.YAHTZEE):  # only reachable while the box is open
            child = new_mask * 128 + _is_yahtzee_int * 64 + upper
            val = base + V[child]
        else:  # lower, non-Yahtzee: child state is the same for every hand
            val = base + V[state_index(new_mask, elig, upper)]
        np.maximum(e3, val, out=e3)

    # Joker override: when the box is filled, an extra Yahtzee is a forced placement.
    if box_filled:
        for face in range(6):
            e3[_YAH_HAND[face]] = _joker_best(V, mask, elig, upper, face)

    # Rolls 2 and 1: choose the keep set maximizing expected downstream value.
    e2 = best_keep_value(T @ e3)
    e1 = best_keep_value(T @ e2)
    return float(roll_prob @ e1)


def solve() -> np.ndarray:
    """Compute the full ``V`` table by backward induction. Returns the flat array."""
    V = np.full((1 << NUM_CATEGORIES) * 128, np.nan, dtype=np.float64)
    V[FULL_MASK * 128 : FULL_MASK * 128 + 128] = 0.0  # empty card ahead -> no more score

    for k in range(NUM_CATEGORIES - 1, -1, -1):
        for mask in _MASKS_BY_POPCOUNT[k]:
            unused = [c for c in range(NUM_CATEGORIES) if not (mask >> c) & 1]
            box_filled = bool(mask & YAHTZEE_BIT)
            eligs = (0, 1) if box_filled else (0,)
            reach_uppers = _reachable_uppers(mask)
            for elig in eligs:
                for upper in reach_uppers:
                    V[state_index(mask, elig, upper)] = _turn_value(
                        V, mask, unused, elig, upper, box_filled
                    )
    return V


_V_CACHE: np.ndarray | None = None


def solved_values() -> np.ndarray:
    """Return the ``V`` table, computing it once and caching."""
    global _V_CACHE
    if _V_CACHE is None:
        _V_CACHE = solve()
    return _V_CACHE


def optimal_expected_score() -> float:
    """Optimal expected final score for an empty scorecard (the ≈254.59 benchmark)."""
    return float(solved_values()[state_index(0, 0, 0)])
