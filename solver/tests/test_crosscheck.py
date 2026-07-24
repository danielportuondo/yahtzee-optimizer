"""Guard the committed cross-check fixture against drift (§12).

The TS engine validates itself against the committed fixture; this test keeps that fixture
honest by asserting it equals a fresh build from the current Python source. Regenerate with
``uv run python -m solver.crosscheck`` after any scoring or DP change.
"""

from __future__ import annotations

from solver import crosscheck


def test_committed_fixture_matches_fresh_build():
    committed = crosscheck.DEFAULT_FIXTURE_PATH.read_text()
    fresh = crosscheck.dumps(crosscheck.build_fixture())
    assert committed == fresh, "crosscheck.json is stale — run: uv run python -m solver.crosscheck"


def test_fixture_shape():
    fixture = crosscheck.build_fixture()
    # 252 hands x 13 categories (joker off) + 6 yahtzee hands x 13 categories (joker on).
    assert len(fixture["scoring"]) == 252 * 13 + 6 * 13
    assert len(fixture["states"]) == crosscheck.NUM_STATE_SAMPLES
    assert fixture["states"][0]["index"] == 0  # empty-card anchor
    assert abs(fixture["golden"]["optimal_expected_score"] - 254.5877) < 1e-2
