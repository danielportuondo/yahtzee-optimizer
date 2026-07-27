import styles from "./writeup.module.css";

/**
 * Final-score distribution as a hand-rolled SVG bar chart (no charting dependency). The x-axis
 * is clipped to the bulk of the mass; mean and median are marked. Bars use the `--data` accent,
 * the mean marker uses `--optimal`.
 */
export function ScoreHistogram({
  edges,
  counts,
  binWidth,
  mean,
  median,
}: {
  edges: number[];
  counts: number[];
  binWidth: number;
  mean: number;
  median: number;
}) {
  const XMIN = 125;
  const XMAX = 475;
  const W = 720;
  const H = 300;
  const padL = 14;
  const padR = 14;
  const padT = 22;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const baseline = padT + plotH;

  const xScale = (v: number) => padL + ((v - XMIN) / (XMAX - XMIN)) * plotW;

  const bins = edges
    .map((e, i) => ({ e, c: counts[i] }))
    .filter((b) => b.e >= XMIN && b.e < XMAX);
  const maxC = Math.max(1, ...bins.map((b) => b.c));
  const barW = Math.max(1, xScale(XMIN + binWidth) - xScale(XMIN) - 1);

  const ticks = [150, 200, 250, 300, 350, 400, 450];

  return (
    <svg
      className={styles.chart}
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label={`Distribution of final scores under optimal play; median ${median.toFixed(
        0,
      )}, mean ${mean.toFixed(0)}.`}
    >
      {bins.map((b) => {
        const h = (b.c / maxC) * plotH;
        return (
          <rect
            key={b.e}
            x={xScale(b.e)}
            y={baseline - h}
            width={barW}
            height={h}
            className={styles.bar}
          />
        );
      })}

      {/* baseline + ticks */}
      <line x1={padL} y1={baseline} x2={W - padR} y2={baseline} className={styles.axis} />
      {ticks.map((t) => (
        <g key={t}>
          <line x1={xScale(t)} y1={baseline} x2={xScale(t)} y2={baseline + 4} className={styles.axis} />
          <text x={xScale(t)} y={baseline + 18} className={styles.tick} textAnchor="middle">
            {t}
          </text>
        </g>
      ))}

      {/* median + mean markers */}
      <line x1={xScale(median)} y1={padT} x2={xScale(median)} y2={baseline} className={styles.median} />
      <text x={xScale(median) - 6} y={padT + 4} className={styles.markLabel} textAnchor="end">
        median {median.toFixed(0)}
      </text>
      <line x1={xScale(mean)} y1={padT} x2={xScale(mean)} y2={baseline} className={styles.mean} />
      <text x={xScale(mean) + 6} y={padT + 4} className={styles.markLabelMean} textAnchor="start">
        mean {mean.toFixed(0)}
      </text>
    </svg>
  );
}
