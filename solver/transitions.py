"""Combinatorial building blocks for the Yahtzee DP (§3.1).

Enumerates the two canonical multiset spaces and the reroll transition table:

- ``ROLLS`` — the 252 distinct 5-dice hands (multisets over 6 faces).
- ``KEEPS`` — the 462 distinct keep sets (multisets of size 0..5).
- ``T`` — a 462 x 252 matrix; ``T[k, r]`` is the probability that keeping set ``k`` and
  rerolling the remaining dice yields hand ``r``. Each row is a distribution (sums to 1).
- ``roll_prob`` — the initial-throw distribution over the 252 hands (= the empty-keep row).
- ``subkeep_flat`` / ``subkeep_starts`` — a flattened index of, for each hand, the keep
  sets that are sub-multisets of it, laid out for ``np.maximum.reduceat`` so the within-turn
  "best keep" reduction is a single vectorized op.

A hand/keep is a length-6 tuple of face counts (face ``f`` -> index ``f-1``). The canonical
ordering is: enumerate multisets by ``itertools.combinations_with_replacement`` on faces,
keeps grouped by ascending size. This ordering is the shared spec the TS port must match.
"""

from __future__ import annotations

import math
from itertools import combinations_with_replacement

import numpy as np

NUM_FACES = 6
HAND_SIZE = 5


def _counts_from_faces(faces: tuple[int, ...]) -> tuple[int, ...]:
    counts = [0] * NUM_FACES
    for f in faces:
        counts[f] += 1
    return tuple(counts)


def _enumerate_multisets(size: int) -> list[tuple[int, ...]]:
    return [
        _counts_from_faces(combo)
        for combo in combinations_with_replacement(range(NUM_FACES), size)
    ]


def _multinomial(total: int, counts: tuple[int, ...]) -> int:
    result = math.factorial(total)
    for n in counts:
        result //= math.factorial(n)
    return result


ROLLS: list[tuple[int, ...]] = _enumerate_multisets(HAND_SIZE)
KEEPS: list[tuple[int, ...]] = [
    ms for size in range(HAND_SIZE + 1) for ms in _enumerate_multisets(size)
]

NUM_ROLLS = len(ROLLS)
NUM_KEEPS = len(KEEPS)
assert NUM_ROLLS == 252, NUM_ROLLS
assert NUM_KEEPS == 462, NUM_KEEPS

ROLL_INDEX = {counts: i for i, counts in enumerate(ROLLS)}
KEEP_INDEX = {counts: i for i, counts in enumerate(KEEPS)}
EMPTY_KEEP = KEEP_INDEX[(0,) * NUM_FACES]


def _build_transition() -> np.ndarray:
    T = np.zeros((NUM_KEEPS, NUM_ROLLS), dtype=np.float64)
    for ki, keep in enumerate(KEEPS):
        rerolls = HAND_SIZE - sum(keep)
        denom = NUM_FACES**rerolls
        for ri, roll in enumerate(ROLLS):
            delta = tuple(roll[f] - keep[f] for f in range(NUM_FACES))
            if any(d < 0 for d in delta):
                continue  # keep is not a sub-multiset of this roll
            T[ki, ri] = _multinomial(rerolls, delta) / denom
    return T


T = _build_transition()
roll_prob = T[EMPTY_KEEP].copy()


def _build_subkeeps() -> tuple[np.ndarray, np.ndarray]:
    flat: list[int] = []
    starts = np.empty(NUM_ROLLS, dtype=np.int64)
    for ri, roll in enumerate(ROLLS):
        starts[ri] = len(flat)
        for ki, keep in enumerate(KEEPS):
            if all(keep[f] <= roll[f] for f in range(NUM_FACES)):
                flat.append(ki)
    return np.asarray(flat, dtype=np.int64), starts


subkeep_flat, subkeep_starts = _build_subkeeps()


def best_keep_value(keep_values: np.ndarray) -> np.ndarray:
    """For each of the 252 hands, the max ``keep_values`` over its sub-multiset keeps.

    ``keep_values`` has length ``NUM_KEEPS``; returns a length ``NUM_ROLLS`` array. Every
    hand has at least the empty keep and itself as sub-keeps, so all segments are non-empty.
    """
    gathered = keep_values[subkeep_flat]
    return np.maximum.reduceat(gathered, subkeep_starts)
