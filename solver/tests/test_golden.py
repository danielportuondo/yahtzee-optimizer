"""Golden check: the optimal expected score reproduces the known result (§12).

The empty-scorecard V is the optimal expected final score for standard solitaire Yahtzee
(Hasbro forced-joker ruleset: Yahtzee bonus = +100). The headline figure is ≈254.59; the
precise value is 254.587729, which matches the independent Ballpark-Figures reference
implementation (reported as 254.587729 in float64 / 254.5877227783203 in float32).
"""

from __future__ import annotations

from solver.game_dp import FULL_MASK, optimal_expected_score, solved_values, state_index


def test_optimal_expected_score_matches_known_result():
    ev = optimal_expected_score()
    assert abs(ev - 254.59) < 0.01, ev  # handoff headline benchmark
    assert abs(ev - 254.587729) < 1e-3, ev  # matches the reference solver to printed digits


def test_full_scorecard_has_zero_future_value():
    V = solved_values()
    # a completely filled card yields no additional score
    assert V[state_index(FULL_MASK, 0, 0)] == 0.0
    assert V[state_index(FULL_MASK, 1, 63)] == 0.0


def test_result_is_finite_and_cached():
    # a finite empty-card value proves no unreached (NaN) state ever leaked into the DP
    import math

    a = optimal_expected_score()
    b = optimal_expected_score()
    assert math.isfinite(a)
    assert a == b  # cached, deterministic
