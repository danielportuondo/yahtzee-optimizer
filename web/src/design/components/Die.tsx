import styles from "./Die.module.css";

/** Which of the 9 grid slots (row-major) hold a pip, per face value. */
const PIP_LAYOUT: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export interface DieProps {
  /** Face value 1..6. */
  value: number;
  /** The optimizer recommends holding this die (ignites amber + HOLD tag). */
  recommended?: boolean;
  /** Cycle the value (click / ArrowUp / ArrowDown). */
  onChange?: (next: number) => void;
  label?: string;
}

export function Die({ value, recommended = false, onChange, label }: DieProps) {
  const slots = PIP_LAYOUT[value] ?? [];

  function step(delta: number) {
    if (!onChange) return;
    onChange(((value - 1 + delta + 6) % 6) + 1);
  }

  return (
    <button
      type="button"
      className={`${styles.die} ${recommended ? styles.recommended : ""}`}
      onClick={() => step(1)}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowRight") {
          e.preventDefault();
          step(1);
        } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
          e.preventDefault();
          step(-1);
        }
      }}
      aria-label={`${label ?? "Die"}: showing ${value}${recommended ? ", recommended to hold" : ""}`}
    >
      {recommended && <span className={styles.tag}>HOLD</span>}
      <span className={styles.pips} aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className={styles.slot}>
            {slots.includes(i) && <span className={styles.pip} />}
          </span>
        ))}
      </span>
    </button>
  );
}
