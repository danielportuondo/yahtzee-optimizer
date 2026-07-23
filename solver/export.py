"""Serialize the solved solver tables for the TypeScript within-turn engine (§5 / §11.2).

Emits five files into a target directory (default ``web/public/data/``):

- ``v.f32``            — dense flat ``V`` table, little-endian float32, indexed by
                         ``mask * 128 + eligible * 64 + upper``. Unreachable states are ``NaN``.
- ``transitions.f32``  — the 462 x 252 reroll matrix ``T`` (keep-major), little-endian float32.
- ``rolls.json``       — the 252 hands as face-count tuples, canonical order.
- ``keeps.json``       — the 462 keep sets as face-count tuples, canonical order.
- ``manifest.json``    — the machine-readable spec both Python and TS consume.

The ``V`` index uses a 3-axis state ``(mask, eligible, upper)``; this supersedes the handoff
§5 formula ``mask * 64 + upper``, which omitted the Yahtzee-eligibility axis.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

from solver import game_dp
from solver.scoring import Category
from solver.transitions import EMPTY_KEEP, KEEPS, NUM_KEEPS, NUM_ROLLS, ROLLS, T

DEFAULT_OUT_DIR = Path("web/public/data")


def _f32_bytes(arr: np.ndarray) -> bytes:
    """Little-endian, C-contiguous float32 bytes regardless of host byte order."""
    return np.ascontiguousarray(arr.astype("<f4")).tobytes()


def _manifest(golden: float) -> dict:
    return {
        "format_version": 1,
        "index_formula": "mask * 128 + eligible * 64 + upper",
        "axes": {
            "mask": {"bits": "7+", "range": [0, 8191], "stride": 128},
            "eligible": {
                "range": [0, 1],
                "stride": 64,
                "meaning": "1 if the Yahtzee box holds 50 (future Yahtzees earn +100)",
            },
            "upper": {"range": [0, 63], "stride": 1, "cap": 63},
        },
        "state_count": (1 << game_dp.NUM_CATEGORIES) * 128,
        "v": {
            "file": "v.f32",
            "dtype": "float32",
            "byte_order": "little",
            "length": (1 << game_dp.NUM_CATEGORIES) * 128,
            "unreachable": "NaN",
        },
        "transitions": {
            "file": "transitions.f32",
            "dtype": "float32",
            "byte_order": "little",
            "shape": [NUM_KEEPS, NUM_ROLLS],
            "layout": "row-major (keep-major)",
            "empty_keep_index": EMPTY_KEEP,
        },
        "rolls": {
            "file": "rolls.json",
            "count": NUM_ROLLS,
            "ordering": "combinations_with_replacement(range(6), 5); face f -> count index f-1",
        },
        "keeps": {
            "file": "keeps.json",
            "count": NUM_KEEPS,
            "ordering": "combinations_with_replacement grouped by ascending size; index 0 = empty",
        },
        "ordering": {
            "multisets": "itertools.combinations_with_replacement(range(6), size)",
            "keeps_grouped_by": "ascending size",
            "face_to_index": "face f -> index f-1",
            "sub_multiset_rule": "keep[f] <= roll[f] for all faces f",
        },
        "categories": {c.name: int(c) for c in Category},
        "bonuses": {
            "upper_threshold": game_dp.UPPER_BONUS_THRESHOLD,
            "upper_bonus": game_dp.UPPER_BONUS,
            "yahtzee_bonus": game_dp.YAHTZEE_BONUS,
        },
        "golden": {
            "optimal_expected_score": golden,
            "empty_state_index": game_dp.state_index(0, 0, 0),
        },
        "note": (
            "V uses a 3-axis state (mask, eligible, upper); this supersedes handoff §5's "
            "2-axis formula mask*64+upper, which omitted the Yahtzee-eligibility axis."
        ),
    }


def export_all(out_dir: Path = DEFAULT_OUT_DIR) -> dict:
    """Write all five artifacts to ``out_dir``; return a summary of paths, sizes, and golden."""
    out_dir.mkdir(parents=True, exist_ok=True)

    v = game_dp.solved_values()
    golden = float(v[game_dp.state_index(0, 0, 0)])

    files: dict[str, int] = {}

    def _write_bytes(name: str, data: bytes) -> None:
        (out_dir / name).write_bytes(data)
        files[name] = len(data)

    def _write_json(name: str, obj: object) -> None:
        text = json.dumps(obj, indent=2)
        (out_dir / name).write_text(text)
        files[name] = len(text.encode())

    _write_bytes("v.f32", _f32_bytes(v))
    _write_bytes("transitions.f32", _f32_bytes(T))
    _write_json("rolls.json", [list(r) for r in ROLLS])
    _write_json("keeps.json", [list(k) for k in KEEPS])
    _write_json("manifest.json", _manifest(golden))

    return {"out_dir": str(out_dir), "files": files, "golden": golden}


def main(argv: list[str] | None = None) -> None:
    argv = sys.argv[1:] if argv is None else argv
    out_dir = Path(argv[0]) if argv else DEFAULT_OUT_DIR
    summary = export_all(out_dir)
    print(f"Exported to {summary['out_dir']}")
    for name, size in summary["files"].items():
        print(f"  {name:<18} {size:>10,} bytes")
    print(f"golden V(empty) = {summary['golden']:.6f}")


if __name__ == "__main__":
    main()
