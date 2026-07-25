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
  typography, the dice-ignite signature) instead of generic styling (Phase 4).
- **Playwright** (via MCP) — live visual verification of the Turn Optimizer (desktop + mobile,
  all three roll states).

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
