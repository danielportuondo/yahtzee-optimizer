"""Per-category Yahtzee scoring — pure and state-free.

A *hand* is represented as ``counts``: a length-6 sequence where ``counts[f]`` is the
number of dice showing face ``f + 1`` (so ``sum(counts) == 5`` for a full roll).

``score_category`` returns only the base category points. The two state-dependent
bonuses are applied by the DP, not here:

- the **+35 upper bonus** (upper subtotal >= 63), and
- the **+100 Yahtzee bonus** (an extra Yahtzee when the Yahtzee box already holds 50).

``joker_active`` covers the Hasbro joker rule: when a Yahtzee (5 of a kind) is scored
as a wildcard in Full House / Small Straight / Large Straight, those award their fixed
values even though five-of-a-kind is not literally a full house or straight.
"""

from __future__ import annotations

from collections.abc import Sequence
from enum import IntEnum


class Category(IntEnum):
    ACES = 0
    TWOS = 1
    THREES = 2
    FOURS = 3
    FIVES = 4
    SIXES = 5
    THREE_OF_A_KIND = 6
    FOUR_OF_A_KIND = 7
    FULL_HOUSE = 8
    SMALL_STRAIGHT = 9
    LARGE_STRAIGHT = 10
    YAHTZEE = 11
    CHANCE = 12


NUM_CATEGORIES = 13
UPPER = tuple(range(0, 6))  # Aces..Sixes
LOWER = tuple(range(6, 13))  # 3oak..Chance

_SMALL_STRAIGHTS = ({0, 1, 2, 3}, {1, 2, 3, 4}, {2, 3, 4, 5})
_LARGE_STRAIGHTS = ({0, 1, 2, 3, 4}, {1, 2, 3, 4, 5})


def sum_of_dice(counts: Sequence[int]) -> int:
    """Total pip count of the hand."""
    return sum((f + 1) * n for f, n in enumerate(counts))


def is_yahtzee(counts: Sequence[int]) -> bool:
    return 5 in counts


def _is_full_house(counts: Sequence[int]) -> bool:
    return 3 in counts and 2 in counts


def _present(counts: Sequence[int]) -> set[int]:
    return {f for f, n in enumerate(counts) if n > 0}


def score_category(cat: int, counts: Sequence[int], joker_active: bool = False) -> int:
    """Base points for scoring ``cat`` with ``counts``.

    ``joker_active`` (a Yahtzee played under the joker rule) lets Full House / Small
    Straight / Large Straight pay their fixed values.
    """
    cat = Category(cat)
    joker_yahtzee = joker_active and is_yahtzee(counts)

    if cat in (
        Category.ACES,
        Category.TWOS,
        Category.THREES,
        Category.FOURS,
        Category.FIVES,
        Category.SIXES,
    ):
        return counts[cat] * (cat + 1)

    if cat is Category.THREE_OF_A_KIND:
        return sum_of_dice(counts) if max(counts) >= 3 else 0

    if cat is Category.FOUR_OF_A_KIND:
        return sum_of_dice(counts) if max(counts) >= 4 else 0

    if cat is Category.FULL_HOUSE:
        return 25 if (_is_full_house(counts) or joker_yahtzee) else 0

    if cat is Category.SMALL_STRAIGHT:
        present = _present(counts)
        has_run = any(run <= present for run in _SMALL_STRAIGHTS)
        return 30 if (has_run or joker_yahtzee) else 0

    if cat is Category.LARGE_STRAIGHT:
        present = _present(counts)
        has_run = any(run <= present for run in _LARGE_STRAIGHTS)
        return 40 if (has_run or joker_yahtzee) else 0

    if cat is Category.YAHTZEE:
        return 50 if is_yahtzee(counts) else 0

    if cat is Category.CHANCE:
        return sum_of_dice(counts)

    raise ValueError(f"unknown category: {cat!r}")  # pragma: no cover
