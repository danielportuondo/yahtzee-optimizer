import { useState, type ReactNode } from "react";
import { TurnOptimizer } from "./features/turn-optimizer/TurnOptimizer.js";
import { GameBoard } from "./features/game/GameBoard.js";
import { Writeup } from "./features/writeup/Writeup.js";
import { StrategyExplorer } from "./features/strategy/StrategyExplorer.js";
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

export function App() {
  const [view, setView] = useState<View>("optimizer");

  return (
    <>
      <nav className={styles.nav} aria-label="Features">
        <div className={styles.tabs} role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={view === t.id}
              className={`${styles.tab} ${view === t.id ? styles.tabActive : ""}`}
              onClick={() => setView(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>
      {PANELS[view]}
    </>
  );
}
