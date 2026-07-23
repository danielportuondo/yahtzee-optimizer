"""Unit tests for per-category scoring, including joker edge cases (§12)."""

from __future__ import annotations

from solver.scoring import (
    Category as C,
    is_yahtzee,
    score_category,
    sum_of_dice,
)


def counts(*dice: int) -> tuple[int, ...]:
    """Build a length-6 counts tuple from face values (1-6)."""
    out = [0] * 6
    for d in dice:
        out[d - 1] += 1
    assert sum(out) == 5, "a hand must have exactly 5 dice"
    return tuple(out)


def test_helpers():
    assert sum_of_dice(counts(1, 2, 3, 4, 5)) == 15
    assert sum_of_dice(counts(6, 6, 6, 6, 6)) == 30
    assert is_yahtzee(counts(4, 4, 4, 4, 4))
    assert not is_yahtzee(counts(4, 4, 4, 4, 1))


def test_upper_section_counts_matching_face():
    assert score_category(C.ACES, counts(1, 1, 3, 4, 5)) == 2
    assert score_category(C.TWOS, counts(2, 2, 2, 4, 5)) == 6
    assert score_category(C.THREES, counts(3, 3, 3, 1, 2)) == 9
    assert score_category(C.FOURS, counts(4, 4, 1, 2, 3)) == 8
    assert score_category(C.FIVES, counts(5, 5, 5, 5, 1)) == 20
    assert score_category(C.SIXES, counts(6, 1, 2, 3, 4)) == 6
    # none of that face -> 0
    assert score_category(C.SIXES, counts(1, 2, 3, 4, 5)) == 0


def test_three_of_a_kind():
    assert score_category(C.THREE_OF_A_KIND, counts(5, 5, 5, 1, 2)) == 18
    assert score_category(C.THREE_OF_A_KIND, counts(2, 2, 2, 2, 2)) == 10  # >=3 alike
    assert score_category(C.THREE_OF_A_KIND, counts(5, 5, 1, 2, 3)) == 0  # only a pair


def test_four_of_a_kind():
    assert score_category(C.FOUR_OF_A_KIND, counts(6, 6, 6, 6, 1)) == 25
    assert score_category(C.FOUR_OF_A_KIND, counts(6, 6, 6, 6, 6)) == 30
    assert score_category(C.FOUR_OF_A_KIND, counts(6, 6, 6, 1, 2)) == 0  # only three


def test_full_house():
    assert score_category(C.FULL_HOUSE, counts(3, 3, 3, 2, 2)) == 25
    assert score_category(C.FULL_HOUSE, counts(3, 3, 2, 2, 1)) == 0  # two pair, not full house
    # natural five-of-a-kind is NOT a full house without the joker rule
    assert score_category(C.FULL_HOUSE, counts(4, 4, 4, 4, 4)) == 0
    assert score_category(C.FULL_HOUSE, counts(4, 4, 4, 4, 4), joker_active=True) == 25


def test_small_straight():
    assert score_category(C.SMALL_STRAIGHT, counts(1, 2, 3, 4, 6)) == 30
    assert score_category(C.SMALL_STRAIGHT, counts(2, 3, 4, 5, 5)) == 30
    assert score_category(C.SMALL_STRAIGHT, counts(1, 2, 3, 4, 5)) == 30  # large implies small
    assert score_category(C.SMALL_STRAIGHT, counts(1, 2, 3, 5, 6)) == 0  # gap at 4
    # joker: five-alike qualifies only with joker_active
    assert score_category(C.SMALL_STRAIGHT, counts(5, 5, 5, 5, 5)) == 0
    assert score_category(C.SMALL_STRAIGHT, counts(5, 5, 5, 5, 5), joker_active=True) == 30


def test_large_straight():
    assert score_category(C.LARGE_STRAIGHT, counts(1, 2, 3, 4, 5)) == 40
    assert score_category(C.LARGE_STRAIGHT, counts(2, 3, 4, 5, 6)) == 40
    assert score_category(C.LARGE_STRAIGHT, counts(1, 2, 3, 4, 6)) == 0  # only a small straight
    assert score_category(C.LARGE_STRAIGHT, counts(6, 6, 6, 6, 6)) == 0
    assert score_category(C.LARGE_STRAIGHT, counts(6, 6, 6, 6, 6), joker_active=True) == 40


def test_yahtzee_and_chance():
    assert score_category(C.YAHTZEE, counts(4, 4, 4, 4, 4)) == 50
    assert score_category(C.YAHTZEE, counts(4, 4, 4, 4, 1)) == 0
    assert score_category(C.CHANCE, counts(1, 2, 3, 4, 5)) == 15
    assert score_category(C.CHANCE, counts(6, 6, 6, 6, 6)) == 30


def test_joker_does_not_help_non_yahtzee_hands():
    # joker_active is a no-op unless the hand is actually five-of-a-kind
    assert score_category(C.FULL_HOUSE, counts(3, 3, 2, 2, 1), joker_active=True) == 0
    assert score_category(C.SMALL_STRAIGHT, counts(1, 2, 3, 5, 6), joker_active=True) == 0
    assert score_category(C.LARGE_STRAIGHT, counts(1, 2, 3, 4, 6), joker_active=True) == 0
