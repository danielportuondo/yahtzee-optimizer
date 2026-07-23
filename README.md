# Yahtzee Optimizer

An interactive, publicly hosted optimal-Yahtzee tool: given a scorecard state and the dice
you just rolled, it computes the mathematically optimal move (which dice to keep, whether to
reroll, and which category to score) to maximize expected final total score.

The solver reproduces the known optimal expected score for standard solitaire Yahtzee,
**≈ 254.59** points (Verhoeff's ruleset: Yahtzee bonus = +100, joker rules on), which is the
project's headline correctness benchmark.

## Status

**Phase 1 — Python solver core.** Everything else (data export, TypeScript engine, frontend,
findings writeup) is later-phase work. See `CLAUDE_CODE_HANDOFF.md` for the full plan.

## Layout

```
solver/            # Python source of truth
  scoring.py       # per-category scoring incl. joker handling
  transitions.py   # 252 rolls, 462 keeps, reroll transition tables
  game_dp.py       # two-level DP; computes V(state)
  tests/           # scoring edge cases, enumeration counts, golden ≈254.59
```

## Develop

Requires [uv](https://docs.astral.sh/uv/).

```bash
uv sync            # create the venv, install numpy + pytest
uv run pytest -q   # run the solver test suite (incl. the golden check)
```

The golden test computes `V` for the empty scorecard and asserts it matches ≈254.59.

## References

See `REFERENCES.md` — a living list of sources, libraries, and tools, kept current as the
project grows.
