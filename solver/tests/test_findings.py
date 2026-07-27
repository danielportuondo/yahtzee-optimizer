"""Tests for the Monte Carlo findings generator (§6.3 / §12).

The faithfulness tests are deterministic: they prove the reconstructed policy agrees with the
game DP exactly, with no dependence on sampling. The Monte Carlo checks then run a small,
fast batch to sanity-check the aggregate stats and JSON shape.
"""

from __future__ import annotations

import numpy as np
import pytest

from solver import findings, game_dp
from solver.scoring import Category
from solver.transitions import T, best_keep_value, roll_prob

# States chosen to exercise the normal path, an upper subtotal, and the joker override
# (Yahtzee box filled + eligible). All are reachable, so their children are non-NaN in V.
_STATES = [
    (0, 0, 0),  # empty scorecard
    (1 << int(Category.ACES), 0, 3),  # Aces booked at subtotal 3
    (game_dp.YAHTZEE_BIT, 1, 0),  # Yahtzee box holds 50, eligible -> joker rule live
    (game_dp.YAHTZEE_BIT | (1 << int(Category.SIXES)), 1, 18),  # + Sixes, deep upper
]


@pytest.mark.parametrize("mask,elig,upper", _STATES)
def test_policy_move_value_equals_leaf(mask: int, elig: int, upper: int) -> None:
    """Each roll-3 move's stored value equals reward + V[child] (argmax is self-consistent)."""
    V = game_dp.solved_values()
    mv = findings._roll3_moves(V, mask, elig, upper)
    reward = mv.base + mv.upper_bonus + mv.yah_bonus
    assert np.allclose(reward + V[mv.child], mv.value)
    assert np.isfinite(mv.value).all()


@pytest.mark.parametrize("mask,elig,upper", _STATES)
def test_policy_folds_to_dp_turn_value(mask: int, elig: int, upper: int) -> None:
    """Folding the reconstructed roll-3 values reproduces game_dp._turn_value exactly."""
    V = game_dp.solved_values()
    unused = [c for c in range(game_dp.NUM_CATEGORIES) if not (mask >> c) & 1]
    box_filled = bool(mask & game_dp.YAHTZEE_BIT)

    mv = findings._roll3_moves(V, mask, elig, upper)
    e2 = best_keep_value(T @ mv.value)
    e1 = best_keep_value(T @ e2)
    folded = float(roll_prob @ e1)

    expected = game_dp._turn_value(V, mask, unused, elig, upper, box_filled)
    assert folded == pytest.approx(expected, abs=1e-9)


@pytest.mark.parametrize("mask,elig,upper", _STATES)
def test_keep_argmax_matches_best_keep_value(mask: int, elig: int, upper: int) -> None:
    """The chosen keep on each roll attains the best_keep_value maximum for every hand."""
    V = game_dp.solved_values()
    pol = findings._make_policy(V, mask, elig, upper)

    keep_values2 = T @ pol.moves.value
    keep_values1 = T @ best_keep_value(keep_values2)
    assert np.allclose(keep_values2[pol.keep2], best_keep_value(keep_values2))
    assert np.allclose(keep_values1[pol.keep1], best_keep_value(keep_values1))


@pytest.fixture(scope="module")
def small_findings() -> dict:
    return findings.build_findings(n_games=15_000, seed=1)


def test_mc_mean_matches_optimal(small_findings: dict) -> None:
    """Simulated mean converges to the known optimal expected score."""
    sim = small_findings["simulation"]
    assert sim["mean"] == pytest.approx(254.59, abs=2.5)
    assert small_findings["optimal_expected_score"] == pytest.approx(254.5877, abs=1e-3)


def test_accounting_identity(small_findings: dict) -> None:
    """Mean total = sum of per-category means + both bonus means (decomposition is exact)."""
    cat_sum = sum(c["mean"] for c in small_findings["category_contribution"])
    bonuses = small_findings["bonus_contribution"]
    reconstructed = cat_sum + bonuses["upper_bonus_mean"] + bonuses["yahtzee_bonus_mean"]
    assert reconstructed == pytest.approx(small_findings["simulation"]["mean"], abs=1e-6)


def test_distribution_and_probabilities_wellformed(small_findings: dict) -> None:
    dist = small_findings["distribution"]
    counts = dist["counts"]
    cdf = dist["cdf"]
    assert sum(counts) == small_findings["simulation"]["games"]
    assert len(counts) == len(cdf) == len(dist["edges"])
    assert all(a <= b for a, b in zip(cdf, cdf[1:]))  # monotone
    assert cdf[-1] == pytest.approx(1.0)

    pcts = small_findings["simulation"]["percentiles"]
    ordered = [pcts[f"p{k}"] for k in (1, 5, 10, 25, 50, 75, 90, 95, 99)]
    assert ordered == sorted(ordered)

    for p in small_findings["probabilities"].values():
        assert 0.0 <= p <= 1.0

    assert len(small_findings["category_contribution"]) == game_dp.NUM_CATEGORIES
    assert len(small_findings["opening_keeps"]) == 6


def test_write_findings_roundtrips(tmp_path, small_findings) -> None:
    import json

    written = findings.write_findings(tmp_path, n_games=2_000, seed=2)
    loaded = json.loads((tmp_path / "findings.json").read_text())
    assert loaded["format_version"] == written["format_version"]
    assert loaded["simulation"]["games"] == 2_000
