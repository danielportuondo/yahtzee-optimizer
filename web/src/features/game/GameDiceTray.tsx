import { Die } from "../../design/components/Die.js";
import { Button } from "../../design/components/primitives.js";
import styles from "./game.module.css";

export interface GameDiceTrayProps {
  dice: number[];
  rollNumber: 1 | 2 | 3;
  /** Indices the player is holding. */
  held: Set<number>;
  /** Indices the optimizer recommends holding (coach mode only; empty in challenge). */
  recommendedHeld: Set<number>;
  canReroll: boolean;
  onToggleHold: (index: number) => void;
  onReroll: () => void;
}

export function GameDiceTray({
  dice,
  rollNumber,
  held,
  recommendedHeld,
  canReroll,
  onToggleHold,
  onReroll,
}: GameDiceTrayProps) {
  const rerollsLeft = 3 - rollNumber;
  const toReroll = 5 - held.size;

  return (
    <div className={styles.tray}>
      <div className={styles.rollBadge}>
        <span className={styles.rollNum}>ROLL {rollNumber}</span>
        <span className={styles.rollSub}>
          {rollNumber === 3
            ? "must score"
            : `${rerollsLeft} reroll${rerollsLeft === 1 ? "" : "s"} left`}
        </span>
      </div>

      <div className={styles.diceRow}>
        {dice.map((v, i) => (
          <Die
            key={i}
            value={v}
            held={canReroll && held.has(i)}
            recommended={recommendedHeld.has(i)}
            onToggleHold={canReroll ? () => onToggleHold(i) : undefined}
            label={`Die ${i + 1}`}
          />
        ))}
      </div>

      <div className={styles.trayFoot}>
        {canReroll ? (
          <>
            <Button variant="primary" onClick={onReroll}>
              🎲 Reroll {toReroll} {toReroll === 1 ? "die" : "dice"}
            </Button>
            <span className={styles.hint}>Click dice to hold · reroll the rest</span>
          </>
        ) : (
          <span className={styles.hint}>Final roll — pick a category on the scorecard →</span>
        )}
      </div>
    </div>
  );
}
