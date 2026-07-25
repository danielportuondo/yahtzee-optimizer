/**
 * Browser data loader: fetches the five exported tables and hands them to the engine's
 * environment-agnostic `parseEngineData`. The Node/`fs` loader (`loadEngineDataFromDir`) is
 * kept for tests; this is the UI path.
 *
 * Files are resolved relative to Vite's `BASE_URL`, so the same code works whether the app is
 * served from a GitHub Pages subpath (`/yahtzee-optimizer/`) or a custom-domain root (`/`).
 */

import { parseEngineData, type Counts, type EngineData, type Manifest } from "../engine/index.js";

/** Load and validate the strategy tables from `${baseUrl}data/`. */
export async function loadEngineDataFromUrl(
  baseUrl: string = import.meta.env.BASE_URL,
): Promise<EngineData> {
  const dataDir = `${baseUrl.replace(/\/?$/, "/")}data/`;

  const [manifest, rolls, keeps, vBytes, transitionsBytes] = await Promise.all([
    fetchJson<Manifest>(`${dataDir}manifest.json`),
    fetchJson<Counts[]>(`${dataDir}rolls.json`),
    fetchJson<Counts[]>(`${dataDir}keeps.json`),
    fetchBytes(`${dataDir}v.f32`),
    fetchBytes(`${dataDir}transitions.f32`),
  ]);

  return parseEngineData({ vBytes, transitionsBytes, rolls, keeps, manifest });
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to load ${url}: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to load ${url}: ${res.status} ${res.statusText}`);
  return new Uint8Array(await res.arrayBuffer());
}
