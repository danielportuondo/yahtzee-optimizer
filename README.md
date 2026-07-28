# Yahtzee Optimizer

An interactive, publicly hosted optimal-Yahtzee tool: given a scorecard state and the dice
you just rolled, it computes the mathematically optimal move (which dice to keep, whether to
reroll, and which category to score) to maximize expected final total score.

The solver reproduces the known optimal expected score for standard solitaire Yahtzee,
**≈ 254.59** points (Verhoeff's ruleset: Yahtzee bonus = +100, joker rules on), which is the
project's headline correctness benchmark.

**Live:** <https://danielportuondo.github.io/yahtzee-optimizer/>

## What it does

A Python dynamic program solves the game exactly — all **1,048,576** states, by backward
induction — and a TypeScript engine mirrors the within-turn math so the site runs entirely in
the browser with no backend. The app has four tabs:

- **Turn Optimizer** — set any scorecard + roll and get the optimal keep/score with EV-ranked
  alternatives, solved live.
- **Play vs. Optimal** — play a full 13-turn game; every hold and score is graded against the
  solver, so the running "EV left on the table" is your skill with luck stripped out (Challenge
  or Coach mode).
- **Strategy Explorer** — the entire 252-row opening book and a heatmap of the solved value
  surface, read live off the value table.
- **Analysis** — what perfect play actually looks like, measured from half a million Monte Carlo
  games under the optimal policy (score distribution, per-box contribution, insights).

## Layout

```
solver/            # Python source of truth
  scoring.py       # per-category scoring incl. joker handling
  transitions.py   # 252 rolls, 462 keeps, reroll transition tables
  game_dp.py       # two-level DP; computes V(state)
  export.py        # serializes the solved tables to web/public/data/
  crosscheck.py    # emits fixtures pinning the TS engine to Python
  findings.py      # Monte Carlo over the optimal policy -> findings.json
  tests/           # scoring, enumeration counts, golden ≈254.59, export, findings

web/               # Vite + React app (static, $0 hosting)
  src/engine/      # TS port of the DP + scoring; loads the exported tables
  src/features/    # turn-optimizer · game · strategy · writeup (one per tab)
  src/design/      # tokens + shared primitives ("probability instrument" theme)
  src/data/        # findings loader + end-game score-percentile helper
  public/data/     # committed solved tables (v.f32, transitions.f32, *.json) + findings.json
```

## Develop

### Solver (Python)

Requires [uv](https://docs.astral.sh/uv/).

```bash
uv sync                            # create the venv, install numpy + pytest
uv run pytest -q                   # solver test suite (incl. the golden ≈254.59 check)
uv run python -m solver.export     # regenerate the solved tables in web/public/data/
uv run python -m solver.findings   # regenerate findings.json (offline Monte Carlo)
```

The golden test computes `V` for the empty scorecard and asserts it matches ≈254.59.

### App (web)

```bash
cd web
npm install
npm run dev        # local dev server
npm run typecheck  # tsc — engine + app projects
npm test           # vitest — engine units + the Python↔TS cross-check
npm run build      # production build to web/dist
npm run preview    # serve the build locally
```

Deploy is automatic: `.github/workflows/deploy.yml` builds `web/` and publishes to GitHub Pages
on every push to `main`. The loader uses `import.meta.env.BASE_URL`, so a move to a custom
domain needs no code change.

## References

See `REFERENCES.md` — a living list of sources, libraries, and tools, kept current as the
project grows.
