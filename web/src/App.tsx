import { useEffect, useState, type ReactNode } from "react";
import { TurnOptimizer } from "./features/turn-optimizer/TurnOptimizer.js";
import { GameBoard } from "./features/game/GameBoard.js";
import { Writeup } from "./features/writeup/Writeup.js";
import { StrategyExplorer } from "./features/strategy/StrategyExplorer.js";
import { Eyebrow } from "./design/components/primitives.js";
import styles from "./App.module.css";

type View = "optimizer" | "play" | "strategy" | "findings";

const TABS: { id: View; label: string }[] = [
  { id: "optimizer", label: "Turn Optimizer" },
  { id: "play", label: "Play vs. Optimal" },
  { id: "strategy", label: "Strategy Explorer" },
  { id: "findings", label: "Analysis" },
];

const PANELS: Record<View, ReactNode> = {
  optimizer: <TurnOptimizer />,
  play: <GameBoard />,
  strategy: <StrategyExplorer />,
  findings: <Writeup />,
};

/** The proven expected score of optimal solitaire Yahtzee (Verhoeff); the piece's leitmotif. */
const OPTIMAL_SCORE = 254.59;
/** States in the shipped value table (2^20) — the size of the solve. */
const SOLVED_STATES = 1_048_576;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Ease a value up to `target` on mount; renders the final value immediately under reduced motion. */
function useCountUp(target: number, durationMs: number): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    let raf = 0;
    let startTs = 0;
    const step = (ts: number) => {
      if (!startTs) startTs = ts;
      const p = Math.min(1, (ts - startTs) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic — quick settle
      setValue(target * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else setValue(target);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}

function Masthead() {
  const score = useCountUp(OPTIMAL_SCORE, 900);
  return (
    <header className={styles.masthead}>
      <div className={styles.titleBlock}>
        <Eyebrow>Dynamic programming · provably optimal</Eyebrow>
        <h1 className={styles.thesis}>Yahtzee, solved exactly.</h1>
        <p className={styles.sub}>
          An exact dynamic-programming solution to solitaire Yahtzee — every optimal decision,
          computed live in your browser.
        </p>
        <p className={styles.identity}>
          Built by Daniel Portuondo ·{" "}
          <a
            className={styles.sourceLink}
            href="https://github.com/danielportuondo/yahtzee-optimizer"
            target="_blank"
            rel="noopener noreferrer"
          >
            Source on GitHub ↗
          </a>
        </p>
      </div>

      <div className={styles.solve} aria-label="Optimal expected score, 254.59, computed exactly">
        <div className={`${styles.solveChain} tnum`}>
          {SOLVED_STATES.toLocaleString("en-US")} states · backward induction
        </div>
        <div className={styles.solveResult}>
          <span className={styles.solveEq}>E[score] =</span>
          <span className={`${styles.solveVal} tnum`}>{score.toFixed(2)}</span>
        </div>
        <div className={styles.solveTag}>exact · reproduces Verhoeff’s benchmark</div>
      </div>
    </header>
  );
}

export function App() {
  const [view, setView] = useState<View>("optimizer");

  return (
    <>
      <Masthead />
      <nav className={styles.nav} aria-label="Features">
        <div className={styles.tabs} role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              role="tab"
              aria-selected={view === t.id}
              aria-controls={`panel-${t.id}`}
              className={`${styles.tab} ${view === t.id ? styles.tabActive : ""}`}
              onClick={() => setView(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>
      <div role="tabpanel" id={`panel-${view}`} aria-labelledby={`tab-${view}`}>
        {PANELS[view]}
      </div>
    </>
  );
}
