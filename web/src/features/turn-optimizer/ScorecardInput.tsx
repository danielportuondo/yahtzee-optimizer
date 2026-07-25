import { Panel } from "../../design/components/primitives.js";
import {
  CATEGORY_LABEL,
  categoriesRemaining,
  LOWER_CATS,
  UPPER_CATS,
  type Scorecard,
} from "./scorecard.js";
import styles from "./turnOptimizer.module.css";

export interface ScorecardInputProps {
  card: Scorecard;
  onChange: (next: Scorecard) => void;
  onReset: () => void;
}

export function ScorecardInput({ card, onChange, onReset }: ScorecardInputProps) {
  function stepUpper(i: number, delta: number) {
    const cur = card.upper[i];
    let next: number | null;
    if (cur === null) next = delta > 0 ? 0 : null;
    else {
      const v = cur + delta;
      next = v < 0 ? null : Math.min(5, v);
    }
    const upper = card.upper.slice();
    upper[i] = next;
    onChange({ ...card, upper });
  }

  function toggleLower(idx: number) {
    const lower = card.lower.slice();
    lower[idx] = !lower[idx];
    onChange({ ...card, lower });
  }

  const upperSubtotal = card.upper.reduce<number>((s, c, i) => s + (c === null ? 0 : c * (i + 1)), 0);
  const pct = Math.min(100, (upperSubtotal / 63) * 100);
  const bonus = upperSubtotal >= 63;

  return (
    <Panel eyebrow="Scorecard state" title={undefined}>
      <div className={styles.cardSection}>
        <div className={styles.cardSecLabel}>
          <span>Upper — dice booked</span>
          <button className={styles.pill} onClick={onReset}>
            clear
          </button>
        </div>
        {UPPER_CATS.map((cat, i) => {
          const cur = card.upper[i];
          return (
            <div key={cat} className={`${styles.catRow} ${cur !== null ? styles.filled : ""}`}>
              <span className={styles.catName}>{CATEGORY_LABEL[cat]}</span>
              <span className={styles.stepper}>
                <span className={styles.hint}>{cur === null ? "" : `${cur * (i + 1)} pts`}</span>
                <button
                  className={styles.stepBtn}
                  onClick={() => stepUpper(i, -1)}
                  aria-label={`Decrease ${CATEGORY_LABEL[cat]}`}
                >
                  −
                </button>
                <span className={styles.stepVal}>{cur === null ? "open" : cur}</span>
                <button
                  className={styles.stepBtn}
                  onClick={() => stepUpper(i, 1)}
                  aria-label={`Increase ${CATEGORY_LABEL[cat]}`}
                >
                  +
                </button>
              </span>
            </div>
          );
        })}
        <div className={styles.upperMeter}>
          <span className={styles.meterTrack}>
            <span
              className={`${styles.meterFill} ${bonus ? styles.meterBonus : ""}`}
              style={{ width: `${pct}%` }}
            />
          </span>
          <span className={styles.meterNum}>
            {upperSubtotal}/63{bonus ? " · +35" : ""}
          </span>
        </div>
      </div>

      <div className={styles.cardSection}>
        <div className={styles.cardSecLabel}>
          <span>Lower — filled?</span>
          <span>{categoriesRemaining(card)} open</span>
        </div>
        {LOWER_CATS.map((cat, idx) => (
          <div key={cat} className={`${styles.catRow} ${card.lower[idx] ? styles.filled : ""}`}>
            <span className={styles.catName}>{CATEGORY_LABEL[cat]}</span>
            <button
              className={`${styles.pill} ${card.lower[idx] ? styles.pillOn : ""}`}
              onClick={() => toggleLower(idx)}
              aria-pressed={card.lower[idx]}
            >
              {card.lower[idx] ? "filled" : "open"}
            </button>
          </div>
        ))}
        <div className={`${styles.catRow} ${card.yahtzee !== "open" ? styles.filled : ""}`}>
          <span className={styles.catName}>Yahtzee</span>
          <span className={styles.stepper}>
            {(["open", "zero", "fifty"] as const).map((s) => (
              <button
                key={s}
                className={`${styles.pill} ${card.yahtzee === s ? styles.pillOn : ""}`}
                onClick={() => onChange({ ...card, yahtzee: s })}
                aria-pressed={card.yahtzee === s}
              >
                {s === "open" ? "open" : s === "zero" ? "0" : "50"}
              </button>
            ))}
          </span>
        </div>
      </div>
    </Panel>
  );
}
