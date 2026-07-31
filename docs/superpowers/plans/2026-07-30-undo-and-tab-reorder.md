# Undo in Play vs. Optimal + tab reorder — Implementation Plan

**Goal:** An unlimited-depth undo button in Play vs. Optimal (snapshot restore —
exact dice faces, holds, roll number, card/grades; nothing re-randomizes), and
Play vs. Optimal becomes the first tab and the landing view.

**Design (approved by Daniel 2026-07-30):**
- Undo covers any last irreversible action — reroll or scoring — one snapshot
  per action, stack unlimited back to turn 1's first roll. Works from the
  game-complete summary (un-books the 13th category). Disabled when empty.
  Grades rewind with the snapshots; no "undo used" marker (Daniel's call).
- Button lives in the status strip next to "New game", same styling.
- Tabs: Play vs. Optimal → Turn Optimizer → Strategy Explorer → Analysis;
  initial view `"play"`.

## Global constraints

- No new dependencies. No new modules — the stack is component state in
  `GameBoard.tsx` (all game state is already updated immutably: pure
  `PlayState` transitions, fresh arrays/Sets on every change, so snapshots
  are safe by reference).
- No commits without Daniel's explicit OK.
- Gate: `npm run typecheck && npm test` from `web/` (vitest; existing
  pure-module tests must stay green — no component-test framework exists,
  precedent is live verification for component wiring).

### Task 1: Tabs (web/src/App.tsx)

- Reorder `TABS` so `{ id: "play", label: "Play vs. Optimal" }` is first and
  `optimizer` second (strategy/findings unchanged).
- `useState<View>("optimizer")` → `useState<View>("play")`.

### Task 2: Undo (web/src/features/game/GameBoard.tsx)

```ts
interface Snapshot {
  play: PlayState;
  dice: number[];
  held: Set<number>;
  rollNumber: 1 | 2 | 3;
}
const [history, setHistory] = useState<Snapshot[]>([]);
```

- `reroll()` and `assign()`: first statement after the guard clause pushes
  `{ play, dice, held, rollNumber }` onto the stack.
- `undo()`: pop the last snapshot, restore all four states via the setters.
  No-op when empty.
- `newGame()`: `setHistory([])`.
- Status strip, before "New game":
  `<button className={styles.newGame} onClick={undo} disabled={history.length === 0}>Undo</button>`
  — add a `:disabled` rule to `.newGame` in `game.module.css` if none exists.

### Task 3: Verify

- `cd web && npm run typecheck && npm test` — clean.
- Live (dev server + browser): landing tab is Play vs. Optimal; tab order
  correct; undo disabled on fresh game; reroll → undo restores the exact
  prior faces/holds/roll number; score → undo un-books (score, EV lost, and
  turn counter rewind); chain undos across a turn boundary back to the very
  first roll; play to game over → undo returns from the summary into turn 13.
