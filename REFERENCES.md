# References

Living reference doc — every source, library, and tool used, kept up to date throughout the
build (updated in the same commit that introduces a new dependency or source).

## Sources / prior art

- Tom Verhoeff, *Optimal Solitaire Yahtzee Player*, TU Eindhoven — the canonical solver and
  ruleset. <https://www-set.win.tue.nl/~wstomv/misc/yahtzee/osyp.php>
- Ballpark-Figures/yahtzee (Python/Jupyter treatment of the math). —
  <https://github.com/Ballpark-Figures/yahtzee>

## Libraries & frameworks

- **Python** ≥ 3.12 — solver implementation language.
- **uv** — environment and dependency management.
- **NumPy** (≥ 2.0) — vectorized transition-matrix products and value gathers in the game-level
  DP; required for feasible offline runtime.
- **pytest** (≥ 8.0, dev) — test runner.

### Frontend (`web/`)

- **TypeScript** (5.7) — the within-turn engine and the app; mirrors the Python solver.
- **Vitest** (3) — engine unit tests + the Python↔TS cross-check.
- **Vite** (7) + **@vitejs/plugin-react** (5) — build tooling and dev server. Static export only
  (no SSR/backend) so the site hosts for $0. `base` is the GitHub Pages project subpath.
- **React** (19) — UI. Framework-agnostic engine, so the choice is isolated to `web/src/{features,design}`.
- **@fontsource-variable/space-grotesk**, **@fontsource-variable/jetbrains-mono** — self-hosted
  fonts (no external requests): Space Grotesk for display, JetBrains Mono for all numerics.

## Tools & skills used

- **`frontend-design` skill** — drove the "probability instrument" visual direction (tokens,
  typography, the dice-ignite signature, and the portfolio masthead) instead of generic styling.
- **Playwright** (via MCP) — live visual verification of every tab at desktop + mobile, and
  rendering the 1200×630 social card from the live masthead.

## Validation references

- Optimal solitaire Yahtzee expected score **≈ 254.59** (Verhoeff / Hasbro ruleset: Yahtzee
  bonus = 100, forced joker rules on). The precise value is **254.587729**.
- Our solver's empty-scorecard `V` computes **254.587729**, matching the Ballpark-Figures
  reference implementation (which reports 254.587729 in float64 / 254.5877227783203 in float32).
  This is the project's correctness benchmark (`solver/tests/test_golden.py`).

## Data export format (Phase 2)

`solver/export.py` emits the solved tables to `web/public/data/` for the TypeScript engine to
load. `manifest.json` is the machine-readable spec both sides consume; the TS side imports the
enumeration files directly (rather than regenerating) so the canonical ordering cannot drift.

- **`v.f32`** — dense flat `V` table, little-endian float32, length `8192 * 128 = 1,048,576`
  (4,194,304 bytes). Index formula **`mask * 128 + eligible * 64 + upper`** — a 3-axis state.
  Unreachable states are `NaN` (never read in legal play).
  - This **supersedes handoff §5's `mask * 64 + upper`**, which assumed a 2-axis state and omitted
    the Yahtzee-eligibility axis. `eligible` = 1 iff the Yahtzee box holds 50 (future Yahtzees earn
    the +100 bonus); it is only meaningful once the box is filled.
- **`transitions.f32`** — the `462 x 252` reroll matrix `T`, little-endian float32, row-major
  (keep-major). `T[k, r]` = P(rerolling the non-kept dice of keep `k` yields hand `r`); rows sum
  to 1. The empty keep is index 0, so `roll_prob = T[0]` (not exported separately).
- **`rolls.json`** / **`keeps.json`** — the 252 hands and 462 keep sets as length-6 face-count
  tuples (face `f` → index `f-1`). Canonical order: `itertools.combinations_with_replacement`
  over faces; keeps grouped by ascending size. A keep is a legal sub-multiset of a roll iff
  `keep[f] <= roll[f]` for all faces (the rule the TS side uses to derive valid keeps per roll).
- Scoring is **not** exported — TS reimplements `score_category` and is cross-checked against
  Python (Phase 3). The `categories` name→index map in `manifest.json` pins the enum ordering.
- Data files are committed alongside the code so the frontend and table never drift (§5).

## TypeScript engine (Phase 3)

`web/src/engine/` ports the within-turn DP + scoring from the Python solver (the source of truth
for `V`) so the live tool needs no server. It loads the exported tables and reproduces
`turnValue`; parity is the Phase-3 exit gate.

- **Cross-check** — `solver/crosscheck.py` emits `__fixtures__/crosscheck.json`; `crosscheck.test.ts`
  asserts scoring is bit-identical to Python, turn EVs agree within float32 tolerance, and the
  loaded `V` self-reproduces. Golden empty-state EV = **254.5877**.
- **`parseEngineData`** is environment-agnostic (bytes + parsed JSON). The Node `fs` loader lives
  in `engine/dataNode.ts` (test-only); the browser `fetch` loader in `src/data/loadFromUrl.ts`.

## Recommendation API + Turn Optimizer (Phase 4)

- **`GameEngine.recommend(state, dice, rollNumber)`** — surfaces the optimal keep (rolls 1–2) or
  category (roll 3) with EV-ranked alternatives. It adds no DP math: it retains the intermediate
  arrays `turnValue` already computes, so it inherits the Python cross-check. `recommend.test.ts`
  pins this via the identity `Σ rollProb · best.ev == turnValue`.
- **App** — `web/src/features/turn-optimizer/` (feature 1) on `web/src/design/` tokens. The
  scorecard input derives `upper` from the dice booked in each box, keeping every constructed
  `(mask, eligible, upper)` state reachable (no `NaN` V lookups).
- **Deploy** — `.github/workflows/deploy.yml` builds `web/` and publishes `web/dist` to GitHub
  Pages ($0 static hosting). The loader uses `import.meta.env.BASE_URL`, so a later move to a
  custom domain needs no code change.

## Play vs. Optimal — the game (Phase 6)

`web/src/features/game/` plays a full 13-turn game and grades it live against the solver.
`gameState.ts` is pure (no React, no RNG): each keep or score decision is graded as
`evLost = best.ev − chosen.ev`, and the board advances by re-deriving the engine `TurnState`
from the reused `Scorecard`, keeping every mid-game state on the reachable manifold (no `NaN`
lookups). **Challenge** mode hides the optimum and only reveals what each decision conceded (a
per-turn decision log); **Coach** mode surfaces the live `recommend` output. `gameState.test.ts`
pins that the grand total reconciles to `Σ` booked totals and that a fully optimal game leaves
~0 EV over all 13 turns.

## Monte Carlo findings (Phase 7, solver)

`solver/findings.py` reconstructs the optimal *policy* (the argmax `game_dp` discards) on top of
the solved `V`, then plays a large seeded batch of games to produce what `V` alone cannot: a
final-score distribution, P(upper bonus), P(Yahtzee), per-category point contributions, and the
CDF the app uses for the end-game percentile. It mirrors `game_dp`'s reward/child-state
arithmetic exactly — nothing in the DP is modified. Output is `web/public/data/findings.json`,
committed static so the site needs no runtime. Run `uv run python -m solver.findings`;
`test_findings.py` guards the invariants (simulated mean ≈ exact 254.59, probabilities in range,
CDF monotone).

## Analysis writeup + end-game percentile (Phase 7, web)

`web/src/features/writeup/` reads `findings.json` (`src/data/loadFindings.ts`,
`src/data/useFindings.ts`) and renders it: stat tiles, a hand-rolled SVG score histogram with
median/mean markers, a per-box contribution bar chart, and "how to score higher" insight cards —
every number measured, not asserted. `src/data/percentile.ts` interpolates the binned CDF for
the "beats N% of optimal games" readout shown after a finished game in the Play tab.

## Strategy Explorer (Phase 8)

`web/src/features/strategy/` reconstructs the optimal policy in TS (`GameEngine.openingPolicy`,
the mirror of the Python `_make_policy`) so a single turn-solve yields all 252 optimal
first-roll keeps at once, instead of 252 `recommend()` calls. Two views, both read live off the
shipped `v.f32`: **the opening book** (a sortable 252-row table, with preset board states so the
"right" answer visibly moves) and **the value surface** (a CSS-grid heatmap of mean `V` over
every reachable `(turn, upper-subtotal)` cell). Pure data-shaping lives in `strategyData.ts`;
`strategyData.test.ts` checks each book row's keep + EV agrees exactly with `recommend(.., 1)`.

## Portfolio frame, hero & polish

Framed the tool as a portfolio piece and hardened it for sharing:

- **Masthead** (`web/src/App.tsx`) above the tabs — thesis headline, author + source-repo link,
  and a "solve" readout (`1,048,576 states → E[score] = 254.59`) that counts up once on load and
  renders its final value immediately under `prefers-reduced-motion`. The per-tab "optimal
  expected game score" stat was dropped so the masthead owns the number.
- **Social / SEO** (`web/index.html`) — Open Graph + Twitter tags, `theme-color`, and a 1200×630
  `web/public/og-cover.png` so shared links preview as the piece.
- **Responsive fixes** — the pill tab bar scrolls instead of clipping on phones; the opening book
  hides its least-critical column and shrinks chips below 560px.
- **Design tokens** (`web/src/design/tokens.css`) — `--danger` unifies the error color and
  `--chip` the dice-chip size; the value-surface legend gradient now uses tokens.
