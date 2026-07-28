import { useMemo, useState } from "react";
import type { GameEngine } from "../../engine/index.js";
import { Eyebrow, Panel } from "../../design/components/primitives.js";
import { useEngine } from "../turn-optimizer/useEngine.js";
import { deriveTurnState, emptyScorecard, type Scorecard } from "../turn-optimizer/scorecard.js";
import {
  buildOpeningBook,
  buildValueSurface,
  sortOpeningBook,
  type SortDir,
  type SortKey,
} from "./strategyData.js";
import { OpeningBook } from "./OpeningBook.js";
import { ValueSurface } from "./ValueSurface.js";
import styles from "./strategy.module.css";

interface Preset {
  id: string;
  label: string;
  blurb: string;
  card: Scorecard;
}

/** LOWER_CATS order: [3-of-a-kind, 4-of-a-kind, full house, small straight, large straight, chance]. */
const PRESETS: Preset[] = [
  {
    id: "empty",
    label: "Opening",
    blurb: "Empty scorecard — the classic opening book.",
    card: emptyScorecard(),
  },
  {
    id: "secured",
    label: "Bonus secured",
    blurb: "All six upper boxes booked, so the +35 is locked. Watch the solver stop chasing upper faces.",
    card: { upper: [3, 3, 3, 3, 3, 3], lower: [false, false, false, false, false, false], yahtzee: "open" },
  },
  {
    id: "chasing",
    label: "Chasing the bonus",
    blurb: "Upper subtotal 33 with Aces–Fours still open — keeps tilt toward the low faces to reach 63.",
    card: { upper: [null, null, null, null, 3, 3], lower: [false, false, false, false, false, false], yahtzee: "open" },
  },
  {
    id: "late",
    label: "Late game",
    blurb: "Two boxes left (Four of a Kind, Yahtzee); the openings collapse toward what's still open.",
    card: { upper: [3, 3, 3, 3, 3, 3], lower: [true, false, true, true, true, true], yahtzee: "open" },
  },
];

const PRESET_STATES = PRESETS.map((p) => ({ ...p, state: deriveTurnState(p.card) }));

export function StrategyExplorer() {
  const { engine, loading, error } = useEngine();

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <Eyebrow>Strategy · the opening book</Eyebrow>
          <h1 className={styles.h1}>Every opening, solved</h1>
          <p className={styles.lede}>
            For each of the 252 distinct first rolls, the optimal player holds a specific set of dice.
            Below is that entire opening book — read live off the solved value table — and the value
            surface it lives on. Switch the board state to watch the “right” answer move.
          </p>
        </div>
      </header>

      {loading && <div className={styles.status}>Loading the strategy table…</div>}
      {error && (
        <div className={`${styles.status} ${styles.statusErr}`}>
          Couldn’t load the engine: {error.message}
        </div>
      )}

      {engine && <Content engine={engine} />}

      <footer className={styles.footer}>
        <span>Optimal policy reconstructed live from the solved V-table (1,048,576 states)</span>
        <a
          href="https://www-set.win.tue.nl/~wstomv/misc/yahtzee/osyp.php"
          target="_blank"
          rel="noreferrer"
        >
          Reference: Verhoeff OSYP ↗
        </a>
      </footer>
    </div>
  );
}

function Content({ engine }: { engine: GameEngine }) {
  const [presetId, setPresetId] = useState(PRESET_STATES[0].id);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "ev", dir: "desc" });

  const preset = PRESET_STATES.find((p) => p.id === presetId) ?? PRESET_STATES[0];
  const book = useMemo(() => buildOpeningBook(engine, preset.state), [engine, preset.state]);
  const sorted = useMemo(() => sortOpeningBook(book, sort.key, sort.dir), [book, sort]);
  const grid = useMemo(() => buildValueSurface(engine.data.V), [engine]);
  const stateEv = engine.data.V[engine.stateIndex(preset.state.mask, preset.state.eligible, preset.state.upper)];

  const onSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "desc" ? "asc" : "desc" }
        : { key, dir: key === "hand" ? "asc" : "desc" },
    );

  return (
    <>
      <Panel eyebrow="optimal first-roll keep" title="The opening book">
        <OpeningBook
          rows={sorted}
          sortKey={sort.key}
          sortDir={sort.dir}
          onSort={onSort}
          presets={PRESET_STATES.map((p) => ({ id: p.id, label: p.label }))}
          presetId={presetId}
          onPreset={setPresetId}
          stateEv={stateEv}
        />
        <p className={styles.caption}>
          {preset.blurb} The keep shown maximizes expected additional score — the same call the Turn
          Optimizer makes, evaluated for all 252 openings at once.
        </p>
      </Panel>

      <Panel eyebrow="V(state) · expected points remaining" title="The value surface">
        <ValueSurface grid={grid} />
        <p className={styles.caption}>
          Each cell is the mean solved value over every reachable state at that stage (rows = turn
          number) and upper subtotal (columns, 0–63). Value peaks at the empty scorecard (top-left) and
          decays as boxes fill; the triangular reachable region and the brightening toward the 63
          column — where the <b>+35 upper bonus</b> locks in — both fall straight out of the DP. The
          mean is unweighted (per-state visit frequencies aren't shipped to the client).
        </p>
      </Panel>
    </>
  );
}
