import styles from "./writeup.module.css";

export interface ContribRow {
  label: string;
  value: number;
  tone: "data" | "optimal";
}

/**
 * Mean points contributed per box under optimal play, as a CSS horizontal bar chart. Bonus rows
 * use the `--optimal` accent to set them apart from the 13 category rows (`--data`).
 */
export function ContributionBars({ rows }: { rows: ContribRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className={styles.bars}>
      {rows.map((r) => (
        <div key={r.label} className={styles.barRow}>
          <span className={styles.barLabel}>{r.label}</span>
          <span className={styles.barTrack}>
            <span
              className={`${styles.barFill} ${r.tone === "optimal" ? styles.barFillOptimal : ""}`}
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </span>
          <span className={`${styles.barValue} tnum`}>{r.value.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}
