import { Die } from "../../design/components/Die.js";
import { Button } from "../../design/components/primitives.js";
import styles from "./turnOptimizer.module.css";

export interface DiceTrayProps {
  dice: number[];
  rollNumber: 1 | 2 | 3;
  /** Dice indices the optimizer recommends holding (rolls 1–2 only). */
  recommendedHeld: Set<number>;
  onCycleDie: (index: number, next: number) => void;
  onRollNumber: (n: 1 | 2 | 3) => void;
  onRandomize: () => void;
}

export function DiceTray({
  dice,
  rollNumber,
  recommendedHeld,
  onCycleDie,
  onRollNumber,
  onRandomize,
}: DiceTrayProps) {
  return (
    <div className={styles.tray}>
      <div className={styles.segment} role="tablist" aria-label="Roll number">
        {([1, 2, 3] as const).map((n) => (
          <button
            key={n}
            role="tab"
            aria-selected={rollNumber === n}
            className={`${styles.segBtn} ${rollNumber === n ? styles.segActive : ""}`}
            onClick={() => onRollNumber(n)}
          >
            {n === 3 ? "ROLL 3 · SCORE" : `ROLL ${n}`}
          </button>
        ))}
      </div>

      <div className={styles.diceRow}>
        {dice.map((v, i) => (
          <Die
            key={i}
            value={v}
            recommended={recommendedHeld.has(i)}
            onChange={(next) => onCycleDie(i, next)}
            label={`Die ${i + 1}`}
          />
        ))}
      </div>

      <div className={styles.trayFoot}>
        <Button onClick={onRandomize}>🎲 Roll random</Button>
        <span className={styles.hint}>Click a die to change · ↑ ↓ to adjust</span>
      </div>
    </div>
  );
}
