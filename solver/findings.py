"""Monte Carlo over the optimal policy — generates the writeup's headline numbers (§6.3).

The game DP (:mod:`solver.game_dp`) yields ``V(state)`` (expected additional score) but
discards *which* keep/category was optimal. This module reconstructs the optimal policy on
top of the solved ``V`` — the argmax the DP threw away — and plays a large batch of seeded
games to produce things ``V`` alone cannot give: a final-score *distribution*, P(upper bonus),
P(Yahtzee), per-category point contributions, and the CDF the web app uses for the end-game
percentile.

Nothing in ``game_dp`` is modified; we import its solved table and per-(category, hand) score
tables and mirror the exact reward/child-state arithmetic of ``_turn_value``/``_joker_best``.

Run ``uv run python -m solver.findings`` to (re)write ``web/public/data/findings.json``.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

from solver import game_dp
from solver.game_dp import (
    UPPER_BONUS,
    UPPER_BONUS_THRESHOLD,
    YAHTZEE_BONUS,
    state_index,
)
from solver.scoring import Category
from solver.transitions import (
    KEEPS,
    NUM_ROLLS,
    ROLL_INDEX,
    ROLLS,
    T,
    best_keep_value,
    roll_prob,
    subkeep_flat,
    subkeep_starts,
)

DEFAULT_OUT_DIR = Path("web/public/data")
DEFAULT_GAMES = 500_000  # ~2 min offline; the exact V(empty) stays the headline, this corroborates
DEFAULT_SEED = 20260727
BIN_WIDTH = 5

NUM_CATEGORIES = game_dp.NUM_CATEGORIES
YAHTZEE = int(Category.YAHTZEE)

# Precomputed layout for a vectorized segmented argmax over sub-multiset keeps. Each flat
# position belongs to one hand (``_SEG_ID``); ``_FLAT_POS`` numbers the positions.
_SEG_ID = np.repeat(np.arange(NUM_ROLLS), np.diff(np.append(subkeep_starts, len(subkeep_flat))))
_FLAT_POS = np.arange(len(subkeep_flat))
_SENTINEL_POS = len(subkeep_flat)


def _best_keep_arg(keep_values: np.ndarray) -> np.ndarray:
    """Per hand, the keep index (of its sub-multisets) maximizing ``keep_values``.

    The argmax companion to :func:`transitions.best_keep_value`, over the same segments, fully
    vectorized: take each segment's max, then the first flat position attaining it. Ties break
    to the lowest keep index, which is immaterial (the value is identical).
    """
    gathered = keep_values[subkeep_flat]
    seg_max = np.maximum.reduceat(gathered, subkeep_starts)  # == best_keep_value(keep_values)
    at_max = gathered >= seg_max[_SEG_ID]
    first_pos = np.minimum.reduceat(np.where(at_max, _FLAT_POS, _SENTINEL_POS), subkeep_starts)
    return subkeep_flat[first_pos]


class _RollMoves:
    """The optimal roll-3 decision for every one of the 252 final hands, at one state.

    Each per-hand entry decomposes the booking into category, base points, and the two
    bonuses so the simulator can attribute contributions. ``value`` is the roll-3 leaf value
    (``reward + V[child]``) used to drive the keep decisions on rolls 1 and 2.
    """

    __slots__ = ("cat", "base", "upper_bonus", "yah_bonus", "child", "value")

    def __init__(self) -> None:
        self.cat = np.zeros(NUM_ROLLS, dtype=np.int64)
        self.base = np.zeros(NUM_ROLLS, dtype=np.int64)
        self.upper_bonus = np.zeros(NUM_ROLLS, dtype=np.int64)
        self.yah_bonus = np.zeros(NUM_ROLLS, dtype=np.int64)
        self.child = np.zeros(NUM_ROLLS, dtype=np.int64)  # flat state index of the next state
        self.value = np.full(NUM_ROLLS, -np.inf)


def _roll3_moves(V: np.ndarray, mask: int, elig: int, upper: int) -> _RollMoves:
    """Optimal scoring choice per final hand — mirrors ``game_dp._turn_value`` roll 3."""
    unused = [c for c in range(NUM_CATEGORIES) if not (mask >> c) & 1]
    box_filled = bool(mask & game_dp.YAHTZEE_BIT)
    mv = _RollMoves()

    for c in unused:
        new_mask = mask | (1 << c)
        base = game_dp._base_normal[c]  # length NUM_ROLLS
        if c < 6:  # upper category
            new_upper = np.minimum(UPPER_BONUS_THRESHOLD, upper + base)
            up_bonus = np.where(
                (upper < UPPER_BONUS_THRESHOLD) & (upper + base >= UPPER_BONUS_THRESHOLD),
                UPPER_BONUS,
                0,
            )
            child = new_mask * 128 + elig * 64 + new_upper
            yah_bonus = np.zeros(NUM_ROLLS, dtype=np.int64)
        elif c == YAHTZEE:  # box open -> scoring here flips eligibility for a real Yahtzee
            new_elig = game_dp._is_yahtzee_int
            child = new_mask * 128 + new_elig * 64 + upper
            up_bonus = np.zeros(NUM_ROLLS, dtype=np.int64)
            yah_bonus = np.zeros(NUM_ROLLS, dtype=np.int64)
        else:  # lower, non-Yahtzee: child identical for every hand
            child = np.full(NUM_ROLLS, state_index(new_mask, elig, upper), dtype=np.int64)
            up_bonus = np.zeros(NUM_ROLLS, dtype=np.int64)
            yah_bonus = np.zeros(NUM_ROLLS, dtype=np.int64)

        val = base + up_bonus + yah_bonus + V[child]
        take = val > mv.value
        mv.value = np.where(take, val, mv.value)
        mv.cat = np.where(take, c, mv.cat)
        mv.base = np.where(take, base, mv.base)
        mv.upper_bonus = np.where(take, up_bonus, mv.upper_bonus)
        mv.yah_bonus = np.where(take, yah_bonus, mv.yah_bonus)
        mv.child = np.where(take, child, mv.child)

    if box_filled:  # extra Yahtzees are a forced joker placement (mirror _joker_best)
        for face in range(6):
            _set_joker_move(mv, V, mask, elig, upper, face)
    return mv


def _set_joker_move(
    mv: _RollMoves, V: np.ndarray, mask: int, elig: int, upper: int, face: int
) -> None:
    """Overwrite the five-``face`` hand's move with the forced joker placement."""
    bonus = YAHTZEE_BONUS if elig else 0
    if not (mask >> face) & 1:  # matching upper box open -> forced there
        legal = (face,)
    else:
        open_lower = [c for c in range(6, 13) if not (mask >> c) & 1]
        legal = open_lower if open_lower else [c for c in range(6) if not (mask >> c) & 1]

    hand = game_dp._YAH_HAND[face]
    best_val = -np.inf
    for c in legal:
        new_mask = mask | (1 << c)
        base = int(game_dp._base_joker[c, hand])
        if c < 6:
            new_upper = min(UPPER_BONUS_THRESHOLD, upper + base)
            up_bonus = UPPER_BONUS if (upper < UPPER_BONUS_THRESHOLD <= upper + base) else 0
        else:
            new_upper = upper
            up_bonus = 0
        reward = base + bonus + up_bonus
        cand = reward + V[state_index(new_mask, elig, new_upper)]
        if cand > best_val:
            best_val = cand
            best = (c, base, up_bonus, bonus, state_index(new_mask, elig, new_upper))

    c, base, up_bonus, yb, child = best
    mv.cat[hand] = c
    mv.base[hand] = base
    mv.upper_bonus[hand] = up_bonus
    mv.yah_bonus[hand] = yb
    mv.child[hand] = child
    mv.value[hand] = best_val


class _Policy:
    __slots__ = ("keep1", "keep2", "moves")

    def __init__(self, keep1: np.ndarray, keep2: np.ndarray, moves: _RollMoves) -> None:
        self.keep1 = keep1  # roll-1 keep index per initial hand
        self.keep2 = keep2  # roll-2 keep index per hand
        self.moves = moves


def _make_policy(V: np.ndarray, mask: int, elig: int, upper: int) -> _Policy:
    moves = _roll3_moves(V, mask, elig, upper)
    keep_values2 = T @ moves.value  # value of each keep set going into roll 3
    keep_values1 = T @ best_keep_value(keep_values2)  # ... going into roll 2
    return _Policy(_best_keep_arg(keep_values1), _best_keep_arg(keep_values2), moves)


def _decompose_index(idx: int) -> tuple[int, int, int]:
    mask, rem = divmod(idx, 128)
    elig, upper = divmod(rem, 64)
    return mask, elig, upper


def _cdf_sampler(dist: np.ndarray) -> np.ndarray:
    cdf = np.cumsum(dist)
    cdf[-1] = 1.0  # guard float drift so u < 1 never overshoots
    return cdf


def simulate(n_games: int = DEFAULT_GAMES, seed: int = DEFAULT_SEED) -> dict:
    """Play ``n_games`` seeded games under the optimal policy; return per-game raw arrays."""
    V = game_dp.solved_values()
    rng = np.random.default_rng(seed)

    roll_cdf = _cdf_sampler(roll_prob)
    T_cdf = np.cumsum(T, axis=1)
    T_cdf[:, -1] = 1.0

    cache: dict[int, _Policy] = {}

    def policy(mask: int, elig: int, upper: int) -> _Policy:
        key = state_index(mask, elig, upper)
        pol = cache.get(key)
        if pol is None:
            pol = cache[key] = _make_policy(V, mask, elig, upper)
        return pol

    totals = np.empty(n_games, dtype=np.int64)
    cat_pts = np.zeros((n_games, NUM_CATEGORIES), dtype=np.int64)
    upper_bonus_pts = np.zeros(n_games, dtype=np.int64)
    yah_bonus_pts = np.zeros(n_games, dtype=np.int64)
    yah_bonus_ct = np.zeros(n_games, dtype=np.int64)
    got_yahtzee = np.zeros(n_games, dtype=bool)

    last = NUM_ROLLS - 1
    for g in range(n_games):
        mask = elig = upper = 0
        us = rng.random(NUM_CATEGORIES * 3)
        u = 0
        for _turn in range(NUM_CATEGORIES):
            pol = policy(mask, elig, upper)
            r1 = min(int(np.searchsorted(roll_cdf, us[u], side="right")), last)
            k1 = pol.keep1[r1]
            r2 = min(int(np.searchsorted(T_cdf[k1], us[u + 1], side="right")), last)
            k2 = pol.keep2[r2]
            r3 = min(int(np.searchsorted(T_cdf[k2], us[u + 2], side="right")), last)
            u += 3

            mv = pol.moves
            c = int(mv.cat[r3])
            cat_pts[g, c] += int(mv.base[r3])
            upper_bonus_pts[g] += int(mv.upper_bonus[r3])
            yb = int(mv.yah_bonus[r3])
            yah_bonus_pts[g] += yb
            if yb > 0:
                yah_bonus_ct[g] += 1
            mask, elig, upper = _decompose_index(int(mv.child[r3]))
        got_yahtzee[g] = elig == 1  # the Yahtzee box ended holding 50
        totals[g] = cat_pts[g].sum() + upper_bonus_pts[g] + yah_bonus_pts[g]

    return {
        "n_games": n_games,
        "seed": seed,
        "totals": totals,
        "cat_pts": cat_pts,
        "upper_bonus_pts": upper_bonus_pts,
        "yah_bonus_pts": yah_bonus_pts,
        "yah_bonus_ct": yah_bonus_ct,
        "got_yahtzee": got_yahtzee,
        "distinct_states": len(cache),
    }


def _opening_keeps(V: np.ndarray) -> list[dict]:
    """A small first-roll cheat sheet: optimal roll-1 keep for a few illustrative openings."""
    pol = _make_policy(V, 0, 0, 0)
    examples = [
        [1, 2, 3, 4, 6],  # near-straight, no pair
        [2, 2, 5, 5, 5],  # full house shape
        [1, 1, 1, 3, 4],  # low trips
        [6, 6, 2, 3, 4],  # high pair + junk
        [3, 4, 5, 6, 6],  # four to a large straight
        [1, 2, 2, 5, 6],  # low pair, scattered
    ]
    out = []
    for dice in examples:
        counts = [0] * 6
        for d in dice:
            counts[d - 1] += 1
        r = ROLL_INDEX[tuple(counts)]
        keep_counts = KEEPS[int(pol.keep1[r])]
        keep = [f + 1 for f, n in enumerate(keep_counts) for _ in range(n)]
        out.append({"roll": sorted(dice), "keep": keep})
    return out


def build_findings(n_games: int = DEFAULT_GAMES, seed: int = DEFAULT_SEED) -> dict:
    """Run the simulation and aggregate everything the writeup + percentile need."""
    V = game_dp.solved_values()
    sim = simulate(n_games, seed)
    totals = sim["totals"]
    n = sim["n_games"]

    pct_keys = [1, 5, 10, 25, 50, 75, 90, 95, 99]
    percentiles = {
        f"p{k}": float(np.percentile(totals, k, method="linear")) for k in pct_keys
    }

    max_edge = (int(totals.max()) // BIN_WIDTH + 1) * BIN_WIDTH
    edges = list(range(0, max_edge, BIN_WIDTH))
    counts, _ = np.histogram(totals, bins=[*edges, max_edge])
    cdf = (np.cumsum(counts) / n).tolist()  # fraction of games with score < right edge of bin i

    cat_pts = sim["cat_pts"]
    category_contribution = [
        {
            "category": Category(c).name,
            "mean": float(cat_pts[:, c].mean()),
            "zero_rate": float((cat_pts[:, c] == 0).mean()),
        }
        for c in range(NUM_CATEGORIES)
    ]

    any_zero = (cat_pts == 0).any(axis=1)

    return {
        "format_version": 1,
        "optimal_expected_score": float(V[state_index(0, 0, 0)]),
        "simulation": {
            "games": n,
            "seed": sim["seed"],
            "distinct_states": sim["distinct_states"],
            "mean": float(totals.mean()),
            "std": float(totals.std()),
            "min": int(totals.min()),
            "max": int(totals.max()),
            "percentiles": percentiles,
        },
        "distribution": {
            "bin_width": BIN_WIDTH,
            "edges": edges,
            "counts": counts.tolist(),
            "cdf": cdf,
        },
        "probabilities": {
            "upper_bonus": float((sim["upper_bonus_pts"] > 0).mean()),
            "at_least_one_yahtzee": float(sim["got_yahtzee"].mean()),
            "yahtzee_bonus_ge1": float((sim["yah_bonus_ct"] > 0).mean()),
            "any_zero_scored": float(any_zero.mean()),
        },
        "category_contribution": category_contribution,
        "bonus_contribution": {
            "upper_bonus_mean": float(sim["upper_bonus_pts"].mean()),
            "yahtzee_bonus_mean": float(sim["yah_bonus_pts"].mean()),
        },
        "opening_keeps": _opening_keeps(V),
    }


def write_findings(out_dir: Path = DEFAULT_OUT_DIR, **kwargs) -> dict:
    findings = build_findings(**kwargs)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "findings.json").write_text(json.dumps(findings, indent=2))
    return findings


def main(argv: list[str] | None = None) -> None:
    argv = sys.argv[1:] if argv is None else argv
    out_dir = Path(argv[0]) if argv else DEFAULT_OUT_DIR
    findings = write_findings(out_dir)
    sim = findings["simulation"]
    print(f"Wrote {out_dir / 'findings.json'}")
    print(f"  games              {sim['games']:,} (seed {sim['seed']})")
    print(f"  optimal V(empty)   {findings['optimal_expected_score']:.4f}")
    print(f"  simulated mean     {sim['mean']:.4f}  (std {sim['std']:.2f})")
    print(f"  median / p90       {sim['percentiles']['p50']:.0f} / {sim['percentiles']['p90']:.0f}")
    print(f"  P(upper bonus)     {findings['probabilities']['upper_bonus']:.3f}")
    print(f"  P(>=1 Yahtzee)     {findings['probabilities']['at_least_one_yahtzee']:.3f}")


if __name__ == "__main__":
    main()
