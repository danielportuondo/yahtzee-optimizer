/**
 * Pure, React-free data shaping for the Strategy Explorer. Everything here is deterministic and
 * unit-tested directly (the repo tests logic, not rendered React). Two products:
 *   - the opening book: all 252 opening hands → their optimal roll-1 keep (via GameEngine.openingPolicy);
 *   - the value surface: V(state) aggregated into a (categories-filled × upper-subtotal) heatmap.
 */

import type { Counts, GameEngine, TurnState } from "../../engine/index.js";

/** Ordered dice (ascending face) realizing a face-count multiset. */
export function diceFromCounts(counts: Counts): number[] {
  const dice: number[] = [];
  for (let f = 0; f < counts.length; f++) for (let n = 0; n < counts[f]; n++) dice.push(f + 1);
  return dice;
}

// ---------------------------------------------------------------------------
// Opening book
// ---------------------------------------------------------------------------

export interface OpeningBookRow {
  /** Canonical opening-hand index (0..251). */
  handIndex: number;
  /** The 5 opening dice, ascending. */
  hand: number[];
  /** The optimal keep as dice, ascending (empty ⇒ reroll all). */
  keep: number[];
  /** Number of dice held (0..5). */
  held: number;
  /** Expected additional score after committing the optimal keep. */
  ev: number;
}

export function buildOpeningBook(engine: GameEngine, state: TurnState): OpeningBookRow[] {
  return engine.openingPolicy(state).map((k) => ({
    handIndex: k.handIndex,
    hand: diceFromCounts(engine.data.rolls[k.handIndex]),
    keep: diceFromCounts(k.keptCounts),
    held: k.held,
    ev: k.ev,
  }));
}

export type SortKey = "ev" | "held" | "hand";
export type SortDir = "asc" | "desc";

/** Non-mutating sort with a deterministic ascending-`handIndex` tie-break (stable ordering). */
export function sortOpeningBook(
  rows: OpeningBookRow[],
  key: SortKey,
  dir: SortDir,
): OpeningBookRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let d: number;
    if (key === "ev") d = a.ev - b.ev;
    else if (key === "held") d = a.held - b.held;
    else d = a.handIndex - b.handIndex;
    if (d !== 0) return sign * d;
    return a.handIndex - b.handIndex;
  });
}

// ---------------------------------------------------------------------------
// popcount (categories filled = popcount of the 13-bit mask)
// ---------------------------------------------------------------------------

let _popcount: Uint8Array | null = null;
function popcountTable(): Uint8Array {
  if (_popcount) return _popcount;
  const t = new Uint8Array(8192);
  for (let m = 1; m < 8192; m++) t[m] = (m & 1) + t[m >> 1];
  return (_popcount = t);
}
export function popcount(mask: number): number {
  return popcountTable()[mask];
}

// ---------------------------------------------------------------------------
// Value surface: mean V over reachable states per (categories-filled, upper)
// ---------------------------------------------------------------------------

export interface HeatmapCell {
  /** Categories filled = popcount(mask), 0..12. */
  turns: number;
  /** Upper subtotal, 0..63. */
  upper: number;
  /** Mean V over the reachable states in this cell; NaN if none. */
  meanV: number;
  /** How many reachable (mask, eligible) states were averaged. */
  count: number;
}

export interface HeatmapGrid {
  rows: number; // 13 (categories filled 0..12; the fully-filled terminal V=0 is dropped)
  cols: number; // 64 (upper 0..63)
  cells: HeatmapCell[]; // row-major: turns * cols + upper
  vMin: number; // global min/max over reachable cells (for "global" normalization)
  vMax: number;
  rowMin: number[]; // per-row min/max (for "row" normalization)
  rowMax: number[];
}

/**
 * One linear pass over the shipped V table. Index decode: `idx = mask*128 + eligible*64 + upper`,
 * so `upper = idx & 63`, `mask = idx >> 7`. Both `eligible` planes are folded into each cell.
 * Unreachable states (V = NaN) are skipped, leaving `count === 0` cells for the caller to mute.
 */
export function buildValueSurface(V: Float32Array): HeatmapGrid {
  const rows = 13;
  const cols = 64;
  const sum = new Float64Array(rows * cols);
  const count = new Int32Array(rows * cols);
  const pc = popcountTable();

  for (let idx = 0; idx < V.length; idx++) {
    const v = V[idx];
    if (!Number.isFinite(v)) continue;
    const turns = pc[idx >> 7];
    if (turns >= 13) continue; // fully-filled terminal state (V = 0), not a game position
    const i = turns * cols + (idx & 63);
    sum[i] += v;
    count[i] += 1;
  }

  const cells: HeatmapCell[] = new Array(rows * cols);
  const rowMin = new Array<number>(rows).fill(Infinity);
  const rowMax = new Array<number>(rows).fill(-Infinity);
  let vMin = Infinity;
  let vMax = -Infinity;

  for (let turns = 0; turns < rows; turns++) {
    for (let upper = 0; upper < cols; upper++) {
      const i = turns * cols + upper;
      const c = count[i];
      const meanV = c > 0 ? sum[i] / c : NaN;
      cells[i] = { turns, upper, meanV, count: c };
      if (c > 0) {
        if (meanV < vMin) vMin = meanV;
        if (meanV > vMax) vMax = meanV;
        if (meanV < rowMin[turns]) rowMin[turns] = meanV;
        if (meanV > rowMax[turns]) rowMax[turns] = meanV;
      }
    }
  }

  return { rows, cols, cells, vMin, vMax, rowMin, rowMax };
}

// ---------------------------------------------------------------------------
// Colour ramp — trough → data → optimal (a pure fn can't read CSS custom props, so the
// stops are hardcoded from web/src/design/tokens.css: --trough, --data, --optimal).
// ---------------------------------------------------------------------------

const STOP_LOW = [10, 13, 19]; // --trough  #0a0d13
const STOP_MID = [79, 214, 192]; // --data    #4fd6c0
const STOP_HIGH = [245, 182, 46]; // --optimal #f5b62e

function lerp(a: number[], b: number[], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

/** Map a normalized value t∈[0,1] onto the two-segment trough→data→optimal ramp. */
export function valueToColor(t: number): string {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x < 0.5 ? lerp(STOP_LOW, STOP_MID, x / 0.5) : lerp(STOP_MID, STOP_HIGH, (x - 0.5) / 0.5);
}

export type HeatNormalize = "global" | "row";

/** Cell fill colour, or null for unreachable cells (caller renders those muted). */
export function colorForCell(
  cell: HeatmapCell,
  grid: HeatmapGrid,
  mode: HeatNormalize = "global",
): string | null {
  if (cell.count === 0 || !Number.isFinite(cell.meanV)) return null;
  const lo = mode === "row" ? grid.rowMin[cell.turns] : grid.vMin;
  const hi = mode === "row" ? grid.rowMax[cell.turns] : grid.vMax;
  const t = hi > lo ? (cell.meanV - lo) / (hi - lo) : 1;
  return valueToColor(t);
}
