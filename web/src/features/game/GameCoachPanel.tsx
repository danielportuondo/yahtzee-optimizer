import type { Recommendation } from "../../engine/index.js";
import { EVReadout, Panel } from "../../design/components/primitives.js";
import { RecommendationPanel } from "../turn-optimizer/RecommendationPanel.js";
import { CATEGORY_LABEL } from "../turn-optimizer/scorecard.js";
import type { Grade } from "./gameState.js";
import styles from "./game.module.css";

/** Below this, a decision matched the optimum — shown as "optimal ✓" rather than a tiny loss. */
const OPTIMAL_EPS = 0.05;

export interface GameCoachPanelProps {
  mode: "challenge" | "coach";
  /** Live optimizer output — coach mode only; null in challenge so nothing leaks. */
  rec: Recommendation | null;
  /** Every graded decision so far, in play order. */
  grades: Grade[];
  totalEvLost: number;
}

export function GameCoachPanel({ mode, rec, grades, totalEvLost }: GameCoachPanelProps) {
  if (mode === "coach") {
    return rec ? <RecommendationPanel rec={rec} /> : null;
  }

  // Challenge: the optimal move stays hidden — reveal only how much each decision conceded.
  return (
    <Panel eyebrow="Decision quality" title={undefined}>
      <EVReadout label="EV left on the table" value={totalEvLost} unit="pts" tone="data" digits={1} />
      {grades.length === 0 ? (
        <p className={styles.logEmpty}>
          Hold dice, reroll, and score — each decision is graded silently against optimal.
        </p>
      ) : (
        <div className={styles.log}>
          <div className={styles.logHead}>Decision log · newest first</div>
          <ol className={styles.logList}>
            {decisionRows(grades).map((r) => (
              <li key={r.key} className={styles.logRow}>
                <span className={styles.logTurn}>T{r.turn}</span>
                <span className={styles.logLabel}>{r.label}</span>
                <span className={r.evLost < OPTIMAL_EPS ? styles.logOptimal : styles.logMiss}>
                  {r.evLost < OPTIMAL_EPS ? "optimal ✓" : `−${r.evLost.toFixed(1)}`}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Panel>
  );
}

interface DecisionRow {
  key: number;
  turn: number;
  label: string;
  evLost: number;
}

/** Tag each graded decision with its turn number, newest first. A "score" closes a turn. */
function decisionRows(grades: Grade[]): DecisionRow[] {
  let turn = 1;
  const rows: DecisionRow[] = grades.map((g, i) => {
    const label =
      g.decision === "score" && g.category !== undefined
        ? CATEGORY_LABEL[g.category]
        : `Hold · roll ${g.rollNumber}`;
    const row: DecisionRow = { key: i, turn, label, evLost: g.evLost };
    if (g.decision === "score") turn++;
    return row;
  });
  return rows.reverse();
}
