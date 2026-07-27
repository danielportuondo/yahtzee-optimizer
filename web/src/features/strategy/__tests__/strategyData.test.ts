/**
 * Strategy Explorer data layer. The correctness gate is the opening book: it must equal the
 * solver's optimum. We cross-check `buildOpeningBook` (via `GameEngine.openingPolicy`) against
 * `recommend(..,1)` on every hand, reconstruct the golden 254.5877 headline, and reproduce the
 * Python `findings.json` opening-keep spot-checks. Plus the pure helpers and the value surface.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadEngineDataFromDir } from "../../../engine/dataNode.js";
import { GameEngine } from "../../../engine/index.js";
import type { TurnState } from "../../../engine/index.js";
import {
  buildOpeningBook,
  buildValueSurface,
  colorForCell,
  diceFromCounts,
  popcount,
  sortOpeningBook,
  type OpeningBookRow,
} from "../strategyData.js";

const DATA_DIR = fileURLToPath(new URL("../../../../public/data", import.meta.url));
const data = loadEngineDataFromDir(DATA_DIR);
const engine = new GameEngine(data);

const EMPTY: TurnState = { mask: 0, eligible: 0, upper: 0 };

interface Findings {
  opening_keeps: { roll: number[]; keep: number[] }[];
}
const findings = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../../public/data/findings.json", import.meta.url)), "utf8"),
) as Findings;

const asc = (xs: number[]) => [...xs].sort((a, b) => a - b);

describe("strategyData — pure helpers", () => {
  it("diceFromCounts expands face-counts to ascending dice", () => {
    expect(diceFromCounts([0, 2, 0, 0, 3, 0])).toEqual([2, 2, 5, 5, 5]);
    expect(diceFromCounts([0, 0, 0, 0, 0, 0])).toEqual([]);
  });

  it("popcount counts set bits", () => {
    expect(popcount(0)).toBe(0);
    expect(popcount(0b111)).toBe(3);
    expect(popcount(8191)).toBe(13);
  });

  it("sortOpeningBook is non-mutating with an ascending-handIndex tie-break", () => {
    const rows: OpeningBookRow[] = [
      { handIndex: 2, hand: [], keep: [], held: 3, ev: 10 },
      { handIndex: 0, hand: [], keep: [], held: 3, ev: 20 },
      { handIndex: 1, hand: [], keep: [], held: 3, ev: 20 },
    ];
    const byEv = sortOpeningBook(rows, "ev", "desc");
    expect(byEv.map((r) => r.handIndex)).toEqual([0, 1, 2]); // 20,20 → handIndex asc, then 10
    expect(rows[0].handIndex).toBe(2); // original untouched
    expect(sortOpeningBook(rows, "held", "asc").map((r) => r.handIndex)).toEqual([0, 1, 2]);
  });
});

describe("strategyData — value surface", () => {
  const grid = buildValueSurface(data.V);

  it("is a 13×64 grid with a finite global range", () => {
    expect(grid.rows).toBe(13);
    expect(grid.cols).toBe(64);
    expect(grid.cells.length).toBe(13 * 64);
    expect(Number.isFinite(grid.vMin)).toBe(true);
    expect(Number.isFinite(grid.vMax)).toBe(true);
  });

  it("cell (0 filled, upper 0) is the empty scorecard ≈254.5877 and the global max", () => {
    const cell = grid.cells[0]; // turns 0, upper 0
    expect(cell.count).toBe(1); // only (mask=0, elig=0, upper=0) is reachable there
    expect(cell.meanV).toBeCloseTo(254.5877, 2);
    expect(grid.vMax).toBeCloseTo(254.5877, 2);
  });

  it("cell (0 filled, upper>0) is unreachable → no colour", () => {
    const cell = grid.cells[5]; // turns 0, upper 5
    expect(cell.count).toBe(0);
    expect(Number.isNaN(cell.meanV)).toBe(true);
    expect(colorForCell(cell, grid)).toBeNull();
  });

  it("reachable cells get an rgb fill", () => {
    expect(colorForCell(grid.cells[0], grid)).toMatch(/^rgb\(/);
  });
});

describe("strategyData — opening book vs solver", () => {
  const book = buildOpeningBook(engine, EMPTY);

  it("covers all 252 opening hands", () => {
    expect(book.length).toBe(252);
  });

  it("each row's optimal keep + EV agree exactly with recommend(state, hand, 1)", () => {
    // Same float32 V/T and the same lowest-index tie-break ⇒ bit-identical agreement.
    for (const row of book) {
      const rec = engine.recommend(EMPTY, row.hand, 1);
      if (rec.kind !== "keep") throw new Error("expected keep recommendation");
      expect(row.ev).toBe(rec.ev);
      expect(row.keep).toEqual(diceFromCounts(rec.best.keep));
    }
  });

  it("headline: Σ rollProb·ev reconstructs the optimal 254.5877", () => {
    const rollProb = engine.transitions.rollProb;
    let acc = 0;
    for (const row of book) acc += rollProb[row.handIndex] * row.ev;
    expect(acc).toBeCloseTo(254.5877, 2);
  });

  it("reproduces the findings.json opening-keep spot-checks", () => {
    for (const ok of findings.opening_keeps) {
      const wantHand = asc(ok.roll);
      const row = book.find((r) => r.hand.length === wantHand.length && r.hand.every((d, i) => d === wantHand[i]));
      expect(row, `missing opening hand ${wantHand.join(",")}`).toBeDefined();
      expect(row!.keep).toEqual(asc(ok.keep));
    }
  });
});
