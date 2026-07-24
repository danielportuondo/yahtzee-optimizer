"""Generate the Python↔TS cross-check fixture (§11.3 / §12).

Emits a JSON fixture of sampled inputs with their Python-computed expected outputs, consumed by
the TypeScript engine's Vitest cross-check. Python is the source of truth; the TS port reloads
the same data files, recomputes, and asserts parity. Two cases are recorded:

- ``scoring`` — every hand x category (joker off), plus the six five-of-a-kind hands x category
  (joker on, the only hands the joker flag changes). ``score`` is exact integer base points.
- ``states`` — reachable ``(mask, eligible, upper)`` states with their optimal turn value and V
  index. Anchors (empty card, one-open, box-filled) plus a seeded random sample.

Run via ``uv run python -m solver.crosscheck``. Determinism (seeded RNG, sorted reachable
uppers) lets ``tests/test_crosscheck.py`` assert the committed fixture matches a fresh build.
"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path
from typing import Any

from solver import game_dp, scoring
from solver.game_dp import FULL_MASK, NUM_CATEGORIES, YAHTZEE_BIT
from solver.scoring import Category
from solver.transitions import ROLLS

DEFAULT_FIXTURE_PATH = Path("web/src/engine/__fixtures__/crosscheck.json")
SEED = 20260724
NUM_STATE_SAMPLES = 220


def _scoring_cases() -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    for counts in ROLLS:
        for c in range(NUM_CATEGORIES):
            cases.append(
                {
                    "cat": c,
                    "counts": list(counts),
                    "joker": False,
                    "score": scoring.score_category(c, counts, joker_active=False),
                }
            )
    # The joker flag only changes five-of-a-kind hands; cover all categories for each.
    for face in range(6):
        counts = tuple(5 if i == face else 0 for i in range(6))
        for c in range(NUM_CATEGORIES):
            cases.append(
                {
                    "cat": c,
                    "counts": list(counts),
                    "joker": True,
                    "score": scoring.score_category(c, counts, joker_active=True),
                }
            )
    return cases


def _state_cases(seed: int) -> list[dict[str, Any]]:
    V = game_dp.solved_values()
    seen: set[tuple[int, int, int]] = set()
    cases: list[dict[str, Any]] = []

    def add(mask: int, elig: int, upper: int) -> None:
        key = (mask, elig, upper)
        if key in seen:
            return
        seen.add(key)
        unused = [c for c in range(NUM_CATEGORIES) if not (mask >> c) & 1]
        box_filled = bool(mask & YAHTZEE_BIT)
        turn_value = game_dp._turn_value(V, mask, unused, elig, upper, box_filled)
        cases.append(
            {
                "mask": mask,
                "elig": elig,
                "upper": upper,
                "index": game_dp.state_index(mask, elig, upper),
                "turn_value": turn_value,
            }
        )

    # Anchors: the extremes the random sampler rarely hits.
    add(0, 0, 0)  # empty scorecard -> the ≈254.59 benchmark
    add(1, 0, 5)  # only Aces filled
    box_and_ace = YAHTZEE_BIT | 1
    add(box_and_ace, 0, 3)  # Yahtzee box filled with 0, elig off
    add(box_and_ace, 1, 3)  # Yahtzee box holds 50, elig on
    all_but_aces = FULL_MASK ^ 1  # one open box (Aces), Yahtzee box filled
    add(all_but_aces, 0, 0)
    add(all_but_aces, 1, 63)

    rng = random.Random(seed)
    while len(cases) < NUM_STATE_SAMPLES:
        mask = rng.randrange(0, FULL_MASK)  # exclude FULL_MASK (V is 0 there, no turn)
        box_filled = bool(mask & YAHTZEE_BIT)
        elig = rng.choice((0, 1)) if box_filled else 0
        upper = rng.choice(game_dp._reachable_uppers(mask))
        add(mask, elig, upper)

    return cases


def build_fixture(seed: int = SEED) -> dict[str, Any]:
    return {
        "seed": seed,
        "golden": {
            "index": game_dp.state_index(0, 0, 0),
            "optimal_expected_score": game_dp.optimal_expected_score(),
        },
        "scoring": _scoring_cases(),
        "states": _state_cases(seed),
    }


def dumps(fixture: dict[str, Any]) -> str:
    """Canonical serialization shared by the writer and the drift test."""
    return json.dumps(fixture, indent=2) + "\n"


def write_fixture(path: Path = DEFAULT_FIXTURE_PATH, seed: int = SEED) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dumps(build_fixture(seed)))
    return path


def main() -> None:
    path = write_fixture()
    fixture = build_fixture()
    print(f"wrote {path}")
    print(f"  scoring cases: {len(fixture['scoring'])}")
    print(f"  state cases:   {len(fixture['states'])}")
    print(f"  golden V(empty) = {fixture['golden']['optimal_expected_score']:.6f}")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
