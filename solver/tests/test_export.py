"""Round-trip and contract checks for the exported data files (§5 / §12)."""

from __future__ import annotations

import json

import numpy as np

from solver import export
from solver.game_dp import NUM_CATEGORIES, solved_values, state_index
from solver.scoring import Category
from solver.transitions import KEEPS, NUM_KEEPS, NUM_ROLLS, ROLLS, T

STATE_COUNT = (1 << NUM_CATEGORIES) * 128


def _export(tmp_path):
    export.export_all(tmp_path)
    return tmp_path


def test_v_roundtrip(tmp_path):
    out = _export(tmp_path)
    raw = (out / "v.f32").read_bytes()
    assert len(raw) == STATE_COUNT * 4

    reloaded = np.frombuffer(raw, dtype="<f4")
    expected = solved_values().astype("<f4")
    assert np.array_equal(reloaded, expected, equal_nan=True)
    assert abs(reloaded[state_index(0, 0, 0)] - 254.5877) < 1e-2
    # unreachable states survive the round trip as NaN
    assert np.isnan(reloaded).sum() == np.isnan(expected).sum()


def test_transitions_roundtrip(tmp_path):
    out = _export(tmp_path)
    raw = (out / "transitions.f32").read_bytes()
    assert len(raw) == NUM_KEEPS * NUM_ROLLS * 4

    reloaded = np.frombuffer(raw, dtype="<f4").reshape(NUM_KEEPS, NUM_ROLLS)
    assert np.allclose(reloaded, T.astype("<f4"))
    assert np.allclose(reloaded.sum(axis=1), 1.0, atol=1e-5)


def test_enumerations(tmp_path):
    out = _export(tmp_path)
    rolls = json.loads((out / "rolls.json").read_text())
    keeps = json.loads((out / "keeps.json").read_text())

    assert rolls == [list(r) for r in ROLLS]
    assert keeps == [list(k) for k in KEEPS]
    assert len(rolls) == 252
    assert len(keeps) == 462
    assert keeps[0] == [0, 0, 0, 0, 0, 0]  # EMPTY_KEEP is index 0


def test_manifest(tmp_path):
    out = _export(tmp_path)
    manifest = json.loads((out / "manifest.json").read_text())

    assert manifest["index_formula"] == "mask * 128 + eligible * 64 + upper"
    assert manifest["state_count"] == STATE_COUNT
    assert manifest["categories"] == {c.name: int(c) for c in Category}
    assert manifest["transitions"]["shape"] == [NUM_KEEPS, NUM_ROLLS]
    assert abs(manifest["golden"]["optimal_expected_score"] - 254.5877) < 1e-2
