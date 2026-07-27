import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadEngineDataFromDir } from "../dataNode.js";
import { Transitions } from "../transitions.js";
import { NUM_KEEPS, NUM_ROLLS } from "../types.js";

const DATA_DIR = fileURLToPath(new URL("../../../public/data", import.meta.url));
const data = loadEngineDataFromDir(DATA_DIR);
const tx = new Transitions(data);

describe("enumeration + transition tables", () => {
  it("has the canonical counts and empty keep at index 0", () => {
    expect(data.rolls.length).toBe(NUM_ROLLS);
    expect(data.keeps.length).toBe(NUM_KEEPS);
    expect(data.keeps[0]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(tx.emptyKeep).toBe(0);
  });

  it("every transition row is a probability distribution (sums to 1)", () => {
    for (let k = 0; k < NUM_KEEPS; k++) {
      let s = 0;
      for (let r = 0; r < NUM_ROLLS; r++) s += data.T[k * NUM_ROLLS + r];
      expect(s).toBeCloseTo(1, 4);
    }
  });

  it("rollProb is the empty-keep row and sums to 1", () => {
    let s = 0;
    for (let r = 0; r < NUM_ROLLS; r++) s += tx.rollProb[r];
    expect(s).toBeCloseTo(1, 4);
    expect(tx.rollProb[0]).toBeCloseTo(data.T[0], 6);
  });

  it("matvecT of the all-ones vector recovers the row sums", () => {
    const ones = new Float64Array(NUM_ROLLS).fill(1);
    const out = tx.matvecT(ones);
    expect(out.length).toBe(NUM_KEEPS);
    for (let k = 0; k < NUM_KEEPS; k++) expect(out[k]).toBeCloseTo(1, 4);
  });

  it("bestKeepValue: every hand includes the empty keep as a sub-keep", () => {
    const keepValues = new Float64Array(NUM_KEEPS).fill(0);
    keepValues[tx.emptyKeep] = 100;
    const out = tx.bestKeepValue(keepValues);
    expect(out.length).toBe(NUM_ROLLS);
    for (let r = 0; r < NUM_ROLLS; r++) expect(out[r]).toBe(100);
  });

  it("bestKeepValue of a constant vector is that constant everywhere", () => {
    const out = tx.bestKeepValue(new Float64Array(NUM_KEEPS).fill(7));
    for (let r = 0; r < NUM_ROLLS; r++) expect(out[r]).toBe(7);
  });

  it("bestKeepArg returns an index attaining bestKeepValue for every hand", () => {
    const kv = new Float64Array(NUM_KEEPS).fill(0);
    kv[tx.emptyKeep] = 5; // empty keep is a sub-keep of every hand
    const arg = tx.bestKeepArg(kv);
    const best = tx.bestKeepValue(kv);
    expect(arg.length).toBe(NUM_ROLLS);
    for (let r = 0; r < NUM_ROLLS; r++) {
      expect(kv[arg[r]]).toBe(best[r]);
      expect(arg[r]).toBe(tx.emptyKeep); // 5 is the unique max → empty keep (index 0)
    }
  });

  it("bestKeepArg breaks ties to the lowest keep index in each segment", () => {
    const arg = tx.bestKeepArg(new Float64Array(NUM_KEEPS).fill(3)); // all equal
    for (let r = 0; r < NUM_ROLLS; r++) {
      expect(arg[r]).toBe(tx.subkeepFlat[tx.subkeepStarts[r]]); // first (lowest) sub-keep
    }
  });
});
