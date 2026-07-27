import { Fragment } from "react";
import { colorForCell, type HeatmapGrid } from "./strategyData.js";
import styles from "./strategy.module.css";

/**
 * V(state) as a heatmap: rows are game stage (turn 1..13 = categories filled 0..12), columns are
 * upper subtotal 0..63, colour is mean solved value. Unreachable cells (no finite V) render muted.
 */
export function ValueSurface({ grid }: { grid: HeatmapGrid }) {
  return (
    <div className={styles.surfaceBlock}>
      <div className={styles.surfaceScroll}>
        <div
          className={styles.surface}
          role="img"
          aria-label={
            `Heat map of expected remaining score across ${grid.rows} game stages ` +
            `(turn 1 to 13) and upper subtotal 0 to 63. Brightest at the empty scorecard, ` +
            `fading as the card fills.`
          }
        >
          {Array.from({ length: grid.rows }, (_, turns) => (
            <Fragment key={turns}>
              <div className={styles.rowLabel}>{turns + 1}</div>
              {Array.from({ length: grid.cols }, (_, upper) => {
                const cell = grid.cells[turns * grid.cols + upper];
                const color = colorForCell(cell, grid);
                const cls =
                  `${styles.cell}` +
                  (color === null ? ` ${styles.cellUnreachable}` : "") +
                  (upper === 63 ? ` ${styles.cellGuide}` : "");
                return (
                  <div
                    key={upper}
                    className={cls}
                    style={color ? { background: color } : undefined}
                    title={
                      color
                        ? `turn ${turns + 1} · upper ${upper} · V ${cell.meanV.toFixed(1)}`
                        : `turn ${turns + 1} · upper ${upper} · unreachable`
                    }
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      <div className={styles.surfaceAxes}>
        <span>turn 1 (top) → turn 13 (bottom)</span>
        <span>upper subtotal 0 → 63 (bonus locks at 63)</span>
      </div>

      <div className={styles.legend}>
        <span className={`${styles.legendNum} tnum`}>{grid.vMin.toFixed(0)}</span>
        <span className={styles.legendBar} aria-hidden />
        <span className={`${styles.legendNum} tnum`}>{grid.vMax.toFixed(0)}</span>
        <span className={styles.legendCap}>expected points remaining</span>
      </div>
    </div>
  );
}
