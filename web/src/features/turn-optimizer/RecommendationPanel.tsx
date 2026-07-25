import type { Counts, Recommendation } from "../../engine/index.js";
import { EVReadout, Panel } from "../../design/components/primitives.js";
import { CATEGORY_LABEL } from "./scorecard.js";
import styles from "./turnOptimizer.module.css";

const MAX_ALTS = 7;

function faces(keep: Counts): number[] {
  const out: number[] = [];
  for (let f = 0; f < keep.length; f++) for (let n = 0; n < keep[f]; n++) out.push(f + 1);
  return out;
}

function keepLabel(keep: Counts): string {
  const held = faces(keep);
  if (held.length === 0) return "Reroll all";
  if (held.length === 5) return "Keep all";
  return held.join(" ");
}

interface Alt {
  label: string;
  ev: number;
  best: boolean;
}

export function RecommendationPanel({ rec }: { rec: Recommendation }) {
  let kicker: string;
  let verdict: string;
  let alts: Alt[];

  if (rec.kind === "keep") {
    const held = rec.best.heldDiceIndices.length;
    kicker = rec.rollNumber === 1 ? "First roll" : "Second roll";
    verdict =
      held === 0
        ? "Reroll all five"
        : held === 5
          ? "Keep all five"
          : `Hold ${faces(rec.best.keep).join(" ")}`;
    alts = rec.alternatives.slice(0, MAX_ALTS).map((o, i) => ({
      label: keepLabel(o.keep),
      ev: o.ev,
      best: i === 0,
    }));
  } else {
    kicker = "Final roll · must score";
    verdict = `Score ${CATEGORY_LABEL[rec.best.category]}`;
    alts = rec.alternatives.slice(0, MAX_ALTS).map((o, i) => ({
      label: `${CATEGORY_LABEL[o.category]} · ${o.score}`,
      ev: o.ev,
      best: i === 0,
    }));
  }

  const evs = alts.map((a) => a.ev).filter(Number.isFinite);
  const max = evs.length ? Math.max(...evs) : 1;
  const min = evs.length ? Math.min(...evs) : 0;
  const span = max - min || 1;

  return (
    <Panel eyebrow="Optimal move" title={undefined}>
      <div className={styles.verdict}>
        <span className={styles.verdictKicker}>{kicker}</span>
        <span className={styles.verdictText}>{verdict}</span>
      </div>

      <div className={styles.readoutRow}>
        <EVReadout label="Expected points from here" value={rec.ev} unit="pts" tone="optimal" />
      </div>

      <div className={styles.alts}>
        <div className={styles.altsHead}>
          {rec.kind === "keep" ? "Keep options, ranked by EV" : "Category options, ranked by EV"}
        </div>
        {alts.map((a, i) => (
          <div key={i} className={`${styles.altRow} ${a.best ? styles.altBest : ""}`}>
            <span className={styles.altLabel}>{a.label}</span>
            <span className={styles.altTrack}>
              <span
                className={styles.altFill}
                style={{ width: `${8 + 92 * ((a.ev - min) / span)}%` }}
              />
            </span>
            <span className={styles.altEv}>{Number.isFinite(a.ev) ? a.ev.toFixed(1) : "—"}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
