/**
 * Node/`fs` loader for the exported tables — test-only. Kept out of `data.ts` (and the barrel)
 * so no `node:*` import reaches the browser bundle. The UI uses `../data/loadFromUrl.ts`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEngineData, type EngineData, type Manifest } from "./data.js";
import type { Counts } from "./types.js";

export function loadEngineDataFromDir(dir: string): EngineData {
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as Manifest;
  const rolls = JSON.parse(readFileSync(join(dir, "rolls.json"), "utf8")) as Counts[];
  const keeps = JSON.parse(readFileSync(join(dir, "keeps.json"), "utf8")) as Counts[];
  const vBytes = readFileSync(join(dir, manifest.v.file));
  const transitionsBytes = readFileSync(join(dir, manifest.transitions.file));
  return parseEngineData({ vBytes, transitionsBytes, rolls, keeps, manifest });
}
