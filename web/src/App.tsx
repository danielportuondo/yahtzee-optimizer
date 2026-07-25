import { useState } from "react";
import { TurnOptimizer } from "./features/turn-optimizer/TurnOptimizer.js";
import { GameBoard } from "./features/game/GameBoard.js";
import styles from "./App.module.css";

type View = "optimizer" | "play";

export function App() {
  const [view, setView] = useState<View>("optimizer");

  return (
    <>
      <nav className={styles.nav} aria-label="Features">
        <div className={styles.tabs} role="tablist">
          <button
            role="tab"
            aria-selected={view === "optimizer"}
            className={`${styles.tab} ${view === "optimizer" ? styles.tabActive : ""}`}
            onClick={() => setView("optimizer")}
          >
            Turn Optimizer
          </button>
          <button
            role="tab"
            aria-selected={view === "play"}
            className={`${styles.tab} ${view === "play" ? styles.tabActive : ""}`}
            onClick={() => setView("play")}
          >
            Play vs. Optimal
          </button>
        </div>
      </nav>
      {view === "optimizer" ? <TurnOptimizer /> : <GameBoard />}
    </>
  );
}
