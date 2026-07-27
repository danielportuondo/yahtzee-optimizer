import { Button } from "../../design/components/primitives.js";
import type { OpeningBookRow, SortDir, SortKey } from "./strategyData.js";
import styles from "./strategy.module.css";

interface PresetChoice {
  id: string;
  label: string;
}

/**
 * The hero table: every opening hand of the current board state and the optimal roll-1 keep.
 * Rows arrive pre-sorted; the header buttons only report the sort intent upward.
 */
export function OpeningBook({
  rows,
  sortKey,
  sortDir,
  onSort,
  presets,
  presetId,
  onPreset,
  stateEv,
}: {
  rows: OpeningBookRow[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  presets: PresetChoice[];
  presetId: string;
  onPreset: (id: string) => void;
  stateEv: number;
}) {
  const arrow = (k: SortKey) => (sortKey === k ? (sortDir === "desc" ? " ↓" : " ↑") : "");

  return (
    <div className={styles.book}>
      <div className={styles.controls}>
        <div className={styles.presets} role="group" aria-label="Board state">
          {presets.map((p) => (
            <Button
              key={p.id}
              variant={p.id === presetId ? "primary" : "default"}
              onClick={() => onPreset(p.id)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className={styles.stateEv}>
          <span className={styles.stateEvLabel}>Expected score from here</span>
          <span className={`${styles.stateEvNum} tnum`}>
            {Number.isFinite(stateEv) ? stateEv.toFixed(2) : "—"}
          </span>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>
                <button className={styles.sortBtn} onClick={() => onSort("hand")}>
                  Opening roll{arrow("hand")}
                </button>
              </th>
              <th>Optimal keep</th>
              <th className={styles.numCol}>
                <button className={styles.sortBtn} onClick={() => onSort("held")}>
                  Held{arrow("held")}
                </button>
              </th>
              <th className={styles.numCol}>
                <button className={styles.sortBtn} onClick={() => onSort("ev")}>
                  EV{arrow("ev")}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.handIndex}>
                <td>
                  <span className={styles.dice}>
                    {r.hand.map((d, i) => (
                      <span key={i} className={styles.mini}>
                        {d}
                      </span>
                    ))}
                  </span>
                </td>
                <td>
                  {r.keep.length === 0 ? (
                    <span className={styles.reroll}>reroll all</span>
                  ) : (
                    <span className={styles.dice}>
                      {r.keep.map((d, i) => (
                        <span key={i} className={`${styles.mini} ${styles.miniKeep}`}>
                          {d}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
                <td className={`${styles.numCol} tnum`}>{r.held}</td>
                <td className={`${styles.numCol} ${styles.evCell} tnum`}>{r.ev.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
