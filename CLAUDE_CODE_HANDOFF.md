# Yahtzee Optimizer — Project Handoff

**Owner:** Daniel Portuondo
**Purpose:** Portfolio piece — an interactive, publicly hosted optimal-Yahtzee tool with a written analysis of findings.
**Handoff target:** Claude Code (greenfield repo).
**Date:** 2026-07-23

---

## 1. What we're building

A web app that, given a Yahtzee scorecard state and the dice you just rolled, tells you the **mathematically optimal move** — which dice to keep, whether to reroll, and (on the final roll) which category to score — to **maximize expected final total score**. Around that core solver we wrap three more things: a playable game that grades you against optimal, a written findings/analysis section, and an interactive strategy explorer.

The optimal expected score for standard solitaire Yahtzee is a known result (≈ **254.59** points). Reproducing that number from our own solver is the project's correctness benchmark and one of the headline "findings."

The two reference implementations to study:
- **Tom Verhoeff's Optimal Solitaire Yahtzee Player** (TU Eindhoven) — the canonical solver and ruleset. `https://www-set.win.tue.nl/~wstomv/misc/yahtzee/osyp.php`
- **Ballpark-Figures/yahtzee** (GitHub) — a Python/Jupyter treatment of the math. `https://github.com/Ballpark-Figures/yahtzee`

### Scope (confirmed)
Four features, all in scope:
1. **Turn optimizer** (must-have core)
2. **Playable game** (play in-browser, optimizer suggests best move, scores you vs. optimal)
3. **Analysis / findings writeup**
4. **Strategy explorer** (interactive charts/tables over the precomputed strategy)

### Hard constraints
- **$0 hosting.** Static site only, no paid backend. This drives the architecture (precompute offline, serve static assets).
- **Portfolio quality.** The site must look polished — use the **`frontend-design` skill** to drive the visual design rather than defaulting to generic AI-site styling.
- **Reproducible math.** The solver's expected score must match the known ≈254.59 result before we ship.

---

## 2. The exact ruleset (pin this down first)

Yahtzee has rule variants; the solver's answers only make sense against one fixed ruleset. Use the **standard Hasbro / Verhoeff solitaire rules** so results are comparable to the reference:

- 13 turns, one per category. Each turn: roll 5 dice, then up to **two rerolls** (3 rolls total). Between rolls you keep any subset of dice. After the third roll you **must** assign the result to one unused category (scoring 0 there if it doesn't fit).
- **Categories:** Aces, Twos, Threes, Fours, Fives, Sixes (upper); Three of a Kind, Four of a Kind, Full House, Small Straight, Large Straight, Yahtzee, Chance (lower).
- **Upper-section bonus:** +35 if the sum of the six upper categories is **≥ 63**.
- **Scoring specifics:** 3-of-a-kind and 4-of-a-kind score the **sum of all five dice**; Full House = 25; Small Straight (4 in a row) = 30; Large Straight (5 in a row) = 40; Yahtzee = 50; Chance = sum of all dice.
- **Yahtzee bonus + Joker rule:** each **extra** Yahtzee after the first (when the Yahtzee box already scored 50) is worth **+100 bonus**, and the joker rules govern where it can be placed. This is the standard, and the version Verhoeff's ≈254.59 assumes. **Implement it** — omitting it changes the optimal value and forfeits comparability.

> **Decision flag:** confirm we're matching Verhoeff's ruleset exactly (Yahtzee bonus = 100, joker rules on). The handoff assumes yes.

---

## 3. The algorithm (two-level dynamic programming)

This is the intellectual core and the part worth writing about. The solver decomposes into two nested DPs.

### 3.1 Combinatorial building blocks
- **Distinct rolls of 5 dice** (order-independent, dice are interchangeable): multisets of size 5 over 6 faces = C(10,5) = **252**.
- **Distinct "keep" sets** (0–5 dice kept between rolls): multisets of size 0–5 over 6 faces = 1+6+21+56+126+252 = **462**.
- **Reroll transition probabilities:** for a given keep set, the distribution over the next full 5-dice hand is fixed and precomputable. Precompute a transition table `keep → distribution over 252 rolls`.

### 3.2 Within-turn DP (fast, can run live in the browser)
Given the current scorecard state and a **future-value function** `V(state)` (see 3.3), a single turn is solved by backward induction over the three rolls:

- **Roll 3 (must score):** for each of the 252 possible hands, value = max over unused categories of `immediate_score(cat, hand) + V(state after scoring cat)`.
- **Roll 2 → keep decision:** for each hand, value = max over the (up to) 462 keep sets of the expected value of the resulting roll-3 hand distribution.
- **Roll 1 → keep decision:** same, one level up.

The turn optimizer the user interacts with is exactly this computation, evaluated for the specific hand in front of them. It's cheap (hundreds of states × hundreds of keeps) and runs in-browser in milliseconds — **no need to precompute per-hand recommendations.**

### 3.3 Game-level DP (precomputed offline — the heavy part)
`V(state)` = the expected additional score from optimal play, where a **game state** is:

- **which categories are already filled** — a 13-bit mask, 2^13 = **8,192** values; and
- **upper-section subtotal so far, capped at 63** — **64** values (0–63; anything ≥63 behaves identically because the bonus is already locked).

Upper bound on states: 8,192 × 64 = **524,288** (many are unreachable, so the real count is lower). Yahtzee-bonus eligibility is derivable from the mask + whether Yahtzee scored, so it does not need a separate axis under the joker ruleset — **confirm this during implementation** and add an axis if the chosen joker handling requires it.

Compute `V` by backward induction: the fully-filled scorecard has `V = 0`; work backward, and for each state run the within-turn DP (3.2) to get the expected turn value, which defines `V` for states one category emptier. The empty-scorecard state's `V` is the **optimal expected game score ≈ 254.59** — our correctness check.

### 3.4 Complexity / feasibility
Precomputation is on the order of (number of game states) × (within-turn work). This is seconds-to-minutes in Python — trivial to run offline once. The output is a compact table of `V` values (see §5). This is why **precompute + static** is the right architecture for a $0 site.

---

## 4. Architecture — precompute → static (recommended, $0)

```
┌─────────────────────────┐        build step         ┌──────────────────────────┐
│  Python solver (offline) │ ───────────────────────▶ │  strategy table (data)   │
│  - game-level DP         │   export compact binary   │  V(state) lookup         │
│  - computes V(state)     │   / JSON                  │  + transition tables     │
└─────────────────────────┘                           └────────────┬─────────────┘
                                                                    │ shipped as static asset
                                                                    ▼
                                                       ┌──────────────────────────┐
                                                       │  Static frontend          │
                                                       │  - loads V table          │
                                                       │  - runs within-turn DP    │
                                                       │    live (JS/TS)           │
                                                       │  - optimizer, game,       │
                                                       │    explorer, writeup      │
                                                       └──────────────────────────┘
```

- The **Python solver** runs once (or in CI) and emits the `V` table + transition tables.
- The **frontend** loads those data files and runs the cheap within-turn DP in TypeScript. No server, no per-request compute, so it hosts free on GitHub Pages / Cloudflare Pages / Vercel Hobby.
- **Port vs. reuse:** the within-turn DP must exist in TS for the live tool. Keep the Python solver as the source of truth for `V` and for generating findings; the TS re-implements only the lightweight turn logic. Add a **cross-check test** that TS and Python agree on a sample of states.

> Client-side-only (compute `V` in-browser via WASM) and backend-API approaches were considered and rejected: the first bloats first load and complicates the code; the second isn't $0. Precompute wins on all the stated constraints.

---

## 5. Data model — the strategy table

- **`V(state)` table:** index by `(categoryMask, upperScoreCapped)`. ~524K entries max. Store as a flat `Float32` array (≈2 MB raw, well under 1 MB gzipped) with a documented index formula `idx = categoryMask * 64 + upperScoreCapped`. Consider `Float16`/quantization only if size matters.
- **Transition tables:** `keep set → probability distribution over 252 rolls`, and enumerations of the 252 rolls and 462 keep sets with a canonical ordering shared by Python and TS. **The canonical ordering must be identical on both sides** — make it a single spec both implementations import/generate from.
- **Scoring functions:** `immediate_score(category, hand)` for all 13 categories incl. joker handling — implemented and unit-tested on both sides.
- Ship data files versioned alongside the code so the frontend and table never drift.

---

## 6. Feature specifications

### 6.1 Turn optimizer (core)
- **Inputs:** current scorecard (which categories used + their scores, so upper subtotal is known), the current roll (5 dice), and which roll number we're on (1/2/3).
- **Outputs:** the optimal keep set (highlight which dice to hold), expected final total if you play optimally from here, and on roll 3 the best category to score. Show the **EV of the recommended action** and, ideally, a ranked list of alternatives with their EVs so users see *why*.
- **UX:** dice are clickable/toggleable; a clear "keep these / reroll these" result; running expected-score readout.

### 6.2 Playable game
- Full 13-turn game in-browser: roll, keep, reroll, assign category, upper bonus + Yahtzee bonus handled automatically.
- After each decision (or at end of game), show **your choice vs. optimal** and the **EV you left on the table**. End-of-game summary: your score vs. the ≈254.59 optimal expectation, and a percentile/grade.
- Optional "hint" toggle that surfaces the optimizer inline during play.

### 6.3 Analysis / findings writeup
The portfolio narrative. Candidate findings to feature (generate the real numbers from the solver):
- The optimal expected score (≈254.59) and how it's derived.
- Probability of achieving the 35 upper bonus under optimal play; probability of scoring a Yahtzee; expected score distribution.
- Decision insights: when to chase a Yahtzee vs. bank Chance; how the optimal first-roll keep changes with scorecard state; the value of the Yahtzee bonus.
- Charts should be generated from solver output (reuse the `data:create-viz` / `data:data-visualization` skills for static figures, or render interactively in the explorer).

### 6.4 Strategy explorer
- Interactive tables/heatmaps over the precomputed strategy: e.g. `V` by scorecard state, optimal category decision as a function of hand, EV surfaces across upper-subtotal.
- Let users filter by categories-remaining or upper-progress and inspect the recommended play.

---

## 7. Frontend stack

**Open question (flagged for Claude Code):** Daniel wants it to *"fit my site."* Claude Code should first inspect Daniel's existing personal site/repo and match its framework, styling system, and deploy target. If there's no constraining existing stack, default to a **static-exportable React setup (Next.js static export or Vite + React + TS)** deployed on **GitHub Pages / Cloudflare Pages / Vercel Hobby** ($0). TypeScript throughout for the within-turn DP.

Regardless of framework: **use the `frontend-design` skill** to establish a distinctive, portfolio-grade visual direction (typography, layout, motion) instead of generic styling. Design should be committed to early so the four features share one visual language.

---

## 8. Suggested repo layout

```
yahtzee-optimizer/
├── README.md
├── REFERENCES.md            # living doc — see §9, keep updated
├── solver/                  # Python source of truth
│   ├── scoring.py
│   ├── transitions.py       # 252 rolls, 462 keeps, reroll distributions
│   ├── game_dp.py           # computes V(state)
│   ├── export.py            # emits data files for the frontend
│   ├── findings.py          # generates stats + figures for the writeup
│   └── tests/               # incl. assert optimal EV ≈ 254.59
├── web/                     # static frontend
│   ├── src/
│   │   ├── engine/          # TS within-turn DP + scoring (mirrors solver)
│   │   ├── features/        # optimizer, game, explorer, writeup
│   │   └── design/          # frontend-design output: tokens, components
│   └── public/data/         # V table + transition/enumeration files
└── .github/workflows/       # optional: rebuild data + deploy
```

---

## 9. REFERENCES.md — living reference doc (required)

Maintain a `REFERENCES.md` at the repo root, **kept up to date throughout the build**, listing every reference and tool used. Update it in the same commit whenever a new source, library, or tool is introduced. Suggested sections:
- **Sources / prior art:** Verhoeff OSYP page, Ballpark-Figures/yahtzee, any papers or blog posts on optimal Yahtzee, rule references.
- **Libraries & frameworks:** frontend framework, charting lib, Python numeric libs, etc., with versions and why chosen.
- **Tools & skills used:** `frontend-design` skill, viz skills, hosting/CI tooling.
- **Validation references:** the ≈254.59 figure and where it's corroborated.

Seed it at project start with the two links in §1.

---

## 10. Git workflow

Claude Code **may commit and push freely to the repo.** Recommended discipline: small, focused commits with clear messages; update `REFERENCES.md` in the same commit that introduces a new dependency/source; keep `main` deployable (static build should always succeed). Optional CI in `.github/workflows/` to rebuild the data table and deploy on push.

---

## 11. Build phases / milestones

1. **Solver core (Python):** scoring functions, transition/enumeration tables, within-turn DP, game-level DP. **Exit criterion:** empty-scorecard `V` ≈ 254.59.
2. **Data export:** emit compact `V` table + transition/enumeration files with a documented, shared canonical ordering.
3. **Engine port (TS):** within-turn DP + scoring in TypeScript, loading the exported data. **Exit criterion:** TS matches Python on a sampled set of states/hands.
4. **Design foundation:** run `frontend-design` skill; establish tokens/components/visual direction; match Daniel's site if one exists.
5. **Turn optimizer UI** (feature 1).
6. **Playable game** (feature 2), with vs.-optimal grading.
7. **Findings generation + writeup** (feature 3): compute stats, generate figures, write the article.
8. **Strategy explorer** (feature 4).
9. **Polish, verify, deploy** to a $0 host; final `REFERENCES.md` pass.

---

## 12. Testing & verification

- **Golden check:** optimal expected score from the game DP ≈ **254.59** (this is the single most important test).
- **Scoring unit tests:** every category incl. edge cases and joker/Yahtzee-bonus scenarios.
- **Cross-implementation test:** Python vs. TS engine agree on `immediate_score` and within-turn EV across a random sample of states/hands.
- **Probability sanity:** transition distributions sum to 1; enumerations have the expected counts (252 rolls, 462 keeps).
- **Spot-check vs. Verhoeff:** feed a few scorecard+roll situations into both our tool and the OSYP page and confirm the recommended keep matches.

---

## 13. Decisions still needed from Daniel

1. **Existing site:** which repo/framework/host is your personal site, so the app can match it? (Or is this standalone?)
2. **Ruleset confirmation:** match Verhoeff exactly — Yahtzee bonus = 100 + joker rules on? (Handoff assumes yes.)
3. **Depth of the writeup:** short "here's the result + a few charts," or a longer methodology deep-dive?
4. **Domain/host:** where should it live (subpath of your site, subdomain, standalone Pages URL)?

---

## 14. References (seed for REFERENCES.md)

- Tom Verhoeff, *Optimal Solitaire Yahtzee Player*, TU Eindhoven — `https://www-set.win.tue.nl/~wstomv/misc/yahtzee/osyp.php`
- Ballpark-Figures/yahtzee (Python/Jupyter) — `https://github.com/Ballpark-Figures/yahtzee`
- Optimal solitaire Yahtzee expected score ≈ 254.59 (to be reproduced by our solver).
```