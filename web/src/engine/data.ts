/**
 * Loads and validates the solver's exported tables (see `web/public/data/manifest.json`).
 *
 * `parseEngineData` is environment-agnostic (takes raw bytes + parsed JSON); `loadEngineDataFromDir`
 * is a Node helper used by the tests. A browser `fetch` loader is deferred to the UI phase.
 *
 * Binary blobs (`v.f32`, `transitions.f32`) are little-endian float32. Every realistic host is
 * little-endian; we assert that rather than paying DataView overhead for ~1M floats.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  Category,
  NUM_KEEPS,
  NUM_ROLLS,
  STATE_COUNT,
  UPPER_BONUS,
  UPPER_BONUS_THRESHOLD,
  YAHTZEE_BONUS,
  type Counts,
} from "./types.js";

export interface Manifest {
  format_version: number;
  index_formula: string;
  state_count: number;
  v: { file: string; length: number; byte_order: string };
  transitions: {
    file: string;
    shape: [number, number];
    layout: string;
    empty_keep_index: number;
    byte_order: string;
  };
  categories: Record<string, number>;
  bonuses: { upper_threshold: number; upper_bonus: number; yahtzee_bonus: number };
  golden: { optimal_expected_score: number; empty_state_index: number };
}

export interface EngineData {
  /** Solved V table, length STATE_COUNT; unreachable states are NaN. */
  V: Float32Array;
  /** Reroll matrix, length NUM_KEEPS * NUM_ROLLS, row-major (keep-major). */
  T: Float32Array;
  /** 252 hands as face-count arrays, canonical order. */
  rolls: Counts[];
  /** 462 keep sets as face-count arrays, canonical order (index 0 = empty). */
  keeps: Counts[];
  manifest: Manifest;
}

const EXPECTED_INDEX_FORMULA = "mask * 128 + eligible * 64 + upper";
const GOLDEN_TOLERANCE = 1e-2;

function assertLittleEndian(): void {
  const isLE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  if (!isLE) {
    throw new Error("engine data reader requires a little-endian host");
  }
}

function toFloat32LE(bytes: Uint8Array, expectedLength: number, label: string): Float32Array {
  assertLittleEndian();
  if (bytes.byteLength !== expectedLength * 4) {
    throw new Error(
      `${label}: expected ${expectedLength * 4} bytes, got ${bytes.byteLength}`,
    );
  }
  // Copy into a fresh, 4-aligned ArrayBuffer (a Node Buffer view may be unaligned).
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Float32Array(ab);
}

function validateManifest(manifest: Manifest): void {
  if (manifest.index_formula !== EXPECTED_INDEX_FORMULA) {
    throw new Error(`manifest index_formula mismatch: ${manifest.index_formula}`);
  }
  if (manifest.state_count !== STATE_COUNT || manifest.v.length !== STATE_COUNT) {
    throw new Error("manifest state_count / v.length mismatch");
  }
  const [rows, cols] = manifest.transitions.shape;
  if (rows !== NUM_KEEPS || cols !== NUM_ROLLS) {
    throw new Error(`manifest transitions shape mismatch: [${rows}, ${cols}]`);
  }
  const b = manifest.bonuses;
  if (
    b.upper_threshold !== UPPER_BONUS_THRESHOLD ||
    b.upper_bonus !== UPPER_BONUS ||
    b.yahtzee_bonus !== YAHTZEE_BONUS
  ) {
    throw new Error("manifest bonuses disagree with engine constants");
  }
  // Category enum indices must match the manifest's name->index map exactly.
  const categoryByName = Category as unknown as Record<string, number>;
  for (const name of Object.keys(manifest.categories)) {
    const expected = categoryByName[name];
    if (expected !== manifest.categories[name]) {
      throw new Error(`manifest category '${name}' index mismatch`);
    }
  }
}

export function parseEngineData(input: {
  vBytes: Uint8Array;
  transitionsBytes: Uint8Array;
  rolls: Counts[];
  keeps: Counts[];
  manifest: Manifest;
}): EngineData {
  const { rolls, keeps, manifest } = input;
  validateManifest(manifest);

  if (rolls.length !== NUM_ROLLS) throw new Error(`rolls: expected ${NUM_ROLLS}`);
  if (keeps.length !== NUM_KEEPS) throw new Error(`keeps: expected ${NUM_KEEPS}`);

  const V = toFloat32LE(input.vBytes, STATE_COUNT, "v.f32");
  const T = toFloat32LE(input.transitionsBytes, NUM_KEEPS * NUM_ROLLS, "transitions.f32");

  const goldenIdx = manifest.golden.empty_state_index;
  if (Math.abs(V[goldenIdx] - manifest.golden.optimal_expected_score) > GOLDEN_TOLERANCE) {
    throw new Error(
      `golden mismatch: V[${goldenIdx}]=${V[goldenIdx]} vs ${manifest.golden.optimal_expected_score}`,
    );
  }

  return { V, T, rolls, keeps, manifest };
}

export function loadEngineDataFromDir(dir: string): EngineData {
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as Manifest;
  const rolls = JSON.parse(readFileSync(join(dir, "rolls.json"), "utf8")) as Counts[];
  const keeps = JSON.parse(readFileSync(join(dir, "keeps.json"), "utf8")) as Counts[];
  const vBytes = readFileSync(join(dir, manifest.v.file));
  const transitionsBytes = readFileSync(join(dir, manifest.transitions.file));
  return parseEngineData({ vBytes, transitionsBytes, rolls, keeps, manifest });
}
