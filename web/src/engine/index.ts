/** Public surface of the within-turn engine. */

export * from "./types.js";
export { scoreCategory, sumOfDice, isYahtzee } from "./scoring.js";
export { parseEngineData, type EngineData, type Manifest } from "./data.js";
export { Transitions } from "./transitions.js";
export { GameEngine } from "./gameDp.js";
export type {
  TurnState,
  KeepOption,
  CategoryOption,
  Recommendation,
} from "./recommend.js";
