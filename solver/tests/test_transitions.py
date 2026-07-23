"""Enumeration counts and probability sanity checks (§12)."""

from __future__ import annotations

import numpy as np

from solver import transitions as tr


def test_enumeration_counts():
    assert tr.NUM_ROLLS == 252
    assert tr.NUM_KEEPS == 462
    assert len(tr.ROLLS) == 252
    assert len(tr.KEEPS) == 462
    # every enumerated hand/keep has the right total dice count
    assert all(sum(r) == 5 for r in tr.ROLLS)
    assert all(0 <= sum(k) <= 5 for k in tr.KEEPS)
    # distinct
    assert len(set(tr.ROLLS)) == 252
    assert len(set(tr.KEEPS)) == 462


def test_transition_rows_are_distributions():
    assert tr.T.shape == (462, 252)
    assert np.all(tr.T >= 0)
    assert np.allclose(tr.T.sum(axis=1), 1.0, atol=1e-12)


def test_initial_roll_distribution():
    assert np.isclose(tr.roll_prob.sum(), 1.0, atol=1e-12)
    # roll_prob is exactly the empty-keep row of T
    assert np.array_equal(tr.roll_prob, tr.T[tr.EMPTY_KEEP])
    # a specific Yahtzee hand (five of one face) has probability 1 / 6**5
    five_ones = tr.ROLL_INDEX[(5, 0, 0, 0, 0, 0)]
    assert np.isclose(tr.roll_prob[five_ones], 1 / 6**5, atol=1e-15)
    # a five-distinct-face hand: multinomial(5;1,1,1,1,1,0) = 120 outcomes
    distinct = tr.ROLL_INDEX[(1, 1, 1, 1, 1, 0)]
    assert np.isclose(tr.roll_prob[distinct], 120 / 6**5, atol=1e-15)


def test_keeping_full_hand_is_deterministic():
    # keeping all five dice (no reroll) must land on that exact hand with probability 1
    for roll in ((5, 0, 0, 0, 0, 0), (1, 1, 1, 1, 1, 0), (2, 1, 1, 1, 0, 0)):
        ki = tr.KEEP_INDEX[roll]
        ri = tr.ROLL_INDEX[roll]
        row = tr.T[ki]
        assert np.isclose(row[ri], 1.0)
        assert np.isclose(row.sum(), 1.0)


def test_subkeeps_cover_and_reduce_correctly():
    # a Yahtzee hand's sub-multisets are exactly {0,1,2,3,4,5} of that one face -> 6 keeps
    ri = tr.ROLL_INDEX[(5, 0, 0, 0, 0, 0)]
    start = tr.subkeep_starts[ri]
    end = tr.subkeep_starts[ri + 1] if ri + 1 < tr.NUM_ROLLS else len(tr.subkeep_flat)
    assert end - start == 6

    # best_keep_value must match a brute-force per-hand max over sub-multiset keeps
    rng = np.random.default_rng(0)
    keep_values = rng.standard_normal(tr.NUM_KEEPS)
    got = tr.best_keep_value(keep_values)
    for r_idx, roll in enumerate(tr.ROLLS):
        brute = max(
            keep_values[k_idx]
            for k_idx, keep in enumerate(tr.KEEPS)
            if all(keep[f] <= roll[f] for f in range(6))
        )
        assert np.isclose(got[r_idx], brute)
