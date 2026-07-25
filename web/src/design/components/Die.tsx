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
  /** The player is holding this die (game mode) — cyan ring + HELD tag. */
  held?: boolean;
  /** Cycle the value (click / ArrowUp / ArrowDown). Optimizer mode. */
  onChange?: (next: number) => void;
  /** Toggle hold (game mode). When provided, a click toggles hold instead of cycling. */
  onToggleHold?: () => void;
  label?: string;
}

export function Die({
  value,
  recommended = false,
  held = false,
  onChange,
  onToggleHold,
  label,
}: DieProps) {
  const slots = PIP_LAYOUT[value] ?? [];
  const holdMode = !!onToggleHold;

  function step(delta: number) {
    if (!onChange) return;
    onChange(((value - 1 + delta + 6) % 6) + 1);
  }

  const cls = [styles.die, recommended ? styles.recommended : "", held ? styles.held : ""]
    .filter(Boolean)
    .join(" ");
  const state = held ? ", held" : recommended ? ", recommended to hold" : "";

  return (
    <button
      type="button"
      className={cls}
      aria-pressed={holdMode ? held : undefined}
      onClick={() => (holdMode ? onToggleHold!() : step(1))}
      onKeyDown={(e) => {
        if (holdMode) return; // Space/Enter toggle via the native button click
        if (e.key === "ArrowUp" || e.key === "ArrowRight") {
          e.preventDefault();
          step(1);
        } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
          e.preventDefault();
          step(-1);
        }
      }}
      aria-label={`${label ?? "Die"}: showing ${value}${state}`}
    >
      {held ? (
        <span className={`${styles.tag} ${styles.tagHeld}`}>HELD</span>
      ) : (
        recommended && <span className={styles.tag}>HOLD</span>
      )}
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
