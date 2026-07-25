import type { Recommendation } from "../../engine/index.js";
import { EVReadout, Panel } from "../../design/components/primitives.js";
import { RecommendationPanel } from "../turn-optimizer/RecommendationPanel.js";
import type { Grade } from "./gameState.js";
import styles from "./game.module.css";

export interface GameCoachPanelProps {
  mode: "challenge" | "coach";
  /** Live optimizer output — coach mode only; null in challenge so nothing leaks. */
  rec: Recommendation | null;
  lastGrade: Grade | null;
  totalEvLost: number;
}

export function GameCoachPanel({ mode, rec, lastGrade, totalEvLost }: GameCoachPanelProps) {
  if (mode === "coach") {
    return rec ? <RecommendationPanel rec={rec} /> : null;
  }

  // Challenge: the optimal move stays hidden — reveal only how much you conceded.
  return (
    <Panel eyebrow="Decision quality" title={undefined}>
      <EVReadout label="EV left on the table" value={totalEvLost} unit="pts" tone="data" digits={1} />
      <div className={styles.lastGrade}>
        {lastGrade == null ? (
          <span className={styles.hint}>
            Hold dice, reroll, and score — each decision is graded silently against optimal.
          </span>
        ) : lastGrade.evLost < 0.05 ? (
          <span className={styles.gradeGood}>
            Last {lastGrade.decision === "keep" ? "hold" : "score"}: optimal ✓
          </span>
        ) : (
          <span className={styles.gradeMiss}>
            Last {lastGrade.decision === "keep" ? "hold" : "score"}: −
            {lastGrade.evLost.toFixed(1)} EV
          </span>
        )}
      </div>
    </Panel>
  );
}
