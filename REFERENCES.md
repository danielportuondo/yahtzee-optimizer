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

## Tools & skills used

- (Phase 1: none beyond the above.)

## Validation references

- Optimal solitaire Yahtzee expected score **≈ 254.59** (Verhoeff / Hasbro ruleset: Yahtzee
  bonus = 100, forced joker rules on). The precise value is **254.587729**.
- Our solver's empty-scorecard `V` computes **254.587729**, matching the Ballpark-Figures
  reference implementation (which reports 254.587729 in float64 / 254.5877227783203 in float32).
  This is the project's correctness benchmark (`solver/tests/test_golden.py`).
