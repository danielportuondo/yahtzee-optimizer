import { Category, isYahtzee, scoreCategory } from "../../engine/index.js";
import { Panel } from "../../design/components/primitives.js";
import { CATEGORY_LABEL } from "../turn-optimizer/scorecard.js";
import { countsFromDice, scoreBreakdown, type PlayState } from "./gameState.js";
import styles from "./game.module.css";

const UPPER: Category[] = [
  Category.ACES,
  Category.TWOS,
  Category.THREES,
  Category.FOURS,
  Category.FIVES,
  Category.SIXES,
];
const LOWER: Category[] = [
  Category.THREE_OF_A_KIND,
  Category.FOUR_OF_A_KIND,
  Category.FULL_HOUSE,
  Category.SMALL_STRAIGHT,
  Category.LARGE_STRAIGHT,
  Category.YAHTZEE,
  Category.CHANCE,
];

export interface GameScorecardProps {
  play: PlayState;
  dice: number[];
  /** Open cells are clickable to book the current hand. */
  canAssign: boolean;
  onAssign: (category: Category) => void;
}

export function GameScorecard({ play, dice, canAssign, onAssign }: GameScorecardProps) {
  const counts = countsFromDice(dice);
  const bd = scoreBreakdown(play);

  function row(cat: Category) {
    const booking = play.bookings[cat];
    if (booking) {
      return (
        <div key={cat} className={`${styles.scoreRow} ${styles.rowFilled}`}>
          <span className={styles.rowName}>{CATEGORY_LABEL[cat]}</span>
          <span className={`${styles.rowVal} tnum`}>{booking.base}</span>
        </div>
      );
    }
    // Wildcard applies whenever the Yahtzee box is filled (mirrors the booking gate).
    const jokerActive =
      isYahtzee(counts) && play.card.yahtzee !== "open" && cat !== Category.YAHTZEE;
    const preview = scoreCategory(cat, counts, jokerActive);
    return (
      <button
        key={cat}
        type="button"
        className={`${styles.scoreRow} ${styles.rowOpen}`}
        disabled={!canAssign}
        onClick={() => onAssign(cat)}
      >
        <span className={styles.rowName}>{CATEGORY_LABEL[cat]}</span>
        <span className={`${styles.rowVal} ${styles.rowPreview} tnum`}>
          {canAssign ? `+${preview}` : "—"}
        </span>
      </button>
    );
  }

  return (
    <Panel eyebrow="Scorecard" title={undefined}>
      <div className={styles.scoreGroup}>{UPPER.map(row)}</div>

      <div className={styles.meterRow}>
        <span className={styles.meterTrack}>
          <span
            className={`${styles.meterFill} ${bd.upperBonus ? styles.meterBonus : ""}`}
            style={{ width: `${Math.min(100, (bd.upperSubtotal / 63) * 100)}%` }}
          />
        </span>
        <span className={styles.meterNum}>
          {bd.upperSubtotal}/63{bd.upperBonus ? " · +35 ✓" : ""}
        </span>
      </div>

      <div className={styles.scoreGroup}>{LOWER.map(row)}</div>

      <div className={styles.totals}>
        {bd.yahtzeeBonus > 0 && (
          <div className={styles.totalLine}>
            <span>Yahtzee bonus</span>
            <span className={`${styles.bonusVal} tnum`}>+{bd.yahtzeeBonus}</span>
          </div>
        )}
        <div className={`${styles.totalLine} ${styles.grand}`}>
          <span>Total</span>
          <span className="tnum">{bd.grandTotal}</span>
        </div>
      </div>
    </Panel>
  );
}
