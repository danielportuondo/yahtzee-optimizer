import { useMemo, useState } from "react";
import { Category, type Recommendation } from "../../engine/index.js";
import { Button, EVReadout, Eyebrow, Panel } from "../../design/components/primitives.js";
import { deriveTurnState } from "../turn-optimizer/scorecard.js";
import { useEngine } from "../turn-optimizer/useEngine.js";
import { useFindings } from "../../data/useFindings.js";
import { scorePercentile } from "../../data/percentile.js";
import { GameCoachPanel } from "./GameCoachPanel.js";
import { GameDiceTray } from "./GameDiceTray.js";
import { GameScorecard } from "./GameScorecard.js";
import { initialRoll, rollDice } from "./dice.js";
import {
  applyBooking,
  emptyPlay,
  finalGrade,
  gradeKeep,
  isGameOver,
  scoreBreakdown,
  totalEvLost,
  type PlayState,
} from "./gameState.js";
import styles from "./game.module.css";

type Mode = "challenge" | "coach";

export function GameBoard() {
  const { engine, loading, error } = useEngine();
  const [play, setPlay] = useState<PlayState>(emptyPlay);
  const [dice, setDice] = useState<number[]>(() => initialRoll());
  const [held, setHeld] = useState<Set<number>>(() => new Set());
  const [rollNumber, setRollNumber] = useState<1 | 2 | 3>(1);
  const [mode, setMode] = useState<Mode>("challenge");

  const over = isGameOver(play);
  const ready = !!engine && !over;

  // Coach mode surfaces the live optimum; challenge computes it only inside commit handlers.
  const rec: Recommendation | null = useMemo(() => {
    if (!engine || mode !== "coach" || over) return null;
    try {
      return engine.recommend(deriveTurnState(play.card), dice, rollNumber);
    } catch {
      return null;
    }
  }, [engine, mode, over, play.card, dice, rollNumber]);

  const recommendedHeld = useMemo(() => {
    const s = new Set<number>();
    if (rec && rec.kind === "keep") for (const i of rec.best.heldDiceIndices) s.add(i);
    return s;
  }, [rec]);

  function startTurn() {
    setDice(initialRoll());
    setHeld(new Set());
    setRollNumber(1);
  }

  function toggleHold(i: number) {
    setHeld((prev) => {
      const s = new Set(prev);
      if (s.has(i)) s.delete(i);
      else s.add(i);
      return s;
    });
  }

  function reroll() {
    if (!engine || rollNumber === 3) return;
    const grade = gradeKeep(play, dice, held, rollNumber, engine);
    setPlay((p) => ({ ...p, grades: [...p.grades, grade] }));
    setDice(rollDice(dice, held));
    const next = (rollNumber + 1) as 1 | 2 | 3;
    setRollNumber(next);
    if (next === 3) setHeld(new Set()); // holds are moot on the forced-score roll
  }

  function assign(category: Category) {
    if (!engine || over) return;
    const nextPlay = applyBooking(play, category, dice, rollNumber, engine);
    setPlay(nextPlay);
    if (!isGameOver(nextPlay)) startTurn();
  }

  function newGame() {
    setPlay(emptyPlay());
    startTurn();
  }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <Eyebrow>Optimal solitaire Yahtzee</Eyebrow>
          <h1 className={styles.h1}>Play vs. Optimal</h1>
          <p className={styles.lede}>
            Play a full 13-turn game. Every hold and every score is graded against the solver — the
            gap is the expected points you left on the table, luck stripped out.
          </p>
        </div>
        <div className={styles.headerSide}>
          <div className={styles.segment} role="tablist" aria-label="Mode">
            {(["challenge", "coach"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                className={`${styles.segBtn} ${mode === m ? styles.segActive : ""}`}
                onClick={() => setMode(m)}
              >
                {m === "challenge" ? "CHALLENGE" : "COACH"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className={styles.statusStrip}>
        <span className={styles.statusItem}>
          Turn <b className="tnum">{Math.min(play.turnIndex + (over ? 0 : 1), 13)}</b>/13
        </span>
        <span className={styles.statusItem}>
          Score <b className="tnum">{scoreBreakdown(play).grandTotal}</b>
        </span>
        <span className={styles.statusItem}>
          EV lost <b className="tnum">{totalEvLost(play).toFixed(1)}</b>
        </span>
        <button className={styles.newGame} onClick={newGame}>
          New game
        </button>
      </div>

      <main className={styles.grid}>
        <div className={styles.stage}>
          {loading && <div className={styles.status}>Loading strategy tables…</div>}
          {error && (
            <div className={`${styles.status} ${styles.statusErr}`}>
              Couldn’t load the strategy tables: {error.message}
            </div>
          )}

          {over ? (
            <GameSummary play={play} onNewGame={newGame} />
          ) : (
            !loading &&
            !error && (
              <GameDiceTray
                dice={dice}
                rollNumber={rollNumber}
                held={held}
                recommendedHeld={recommendedHeld}
                canReroll={ready && rollNumber < 3}
                onToggleHold={toggleHold}
                onReroll={reroll}
              />
            )
          )}

          {!over && !loading && !error && (
            <GameCoachPanel
              mode={mode}
              rec={rec}
              grades={play.grades}
              totalEvLost={totalEvLost(play)}
            />
          )}
        </div>

        <aside>
          <GameScorecard play={play} dice={dice} canAssign={ready} onAssign={assign} />
        </aside>
      </main>

      <footer className={styles.footer}>
        <span>Graded live against the two-level DP · optimal averages 254.59</span>
        <a
          href="https://www-set.win.tue.nl/~wstomv/misc/yahtzee/osyp.php"
          target="_blank"
          rel="noreferrer"
        >
          Reference: Verhoeff OSYP ↗
        </a>
      </footer>
    </div>
  );
}

function GameSummary({ play, onNewGame }: { play: PlayState; onNewGame: () => void }) {
  const { findings } = useFindings();
  const evLost = totalEvLost(play);
  const grade = finalGrade(evLost);
  const bd = scoreBreakdown(play);
  const percentile = findings
    ? scorePercentile(findings.distribution.cdf, findings.distribution.bin_width, bd.grandTotal)
    : null;
  return (
    <Panel eyebrow="Game complete" title={undefined}>
      <div className={styles.summaryGrid}>
        <div className={styles.gradeBadge}>
          <div className={`${styles.gradeLetter} tnum`}>{grade.letter}</div>
          <div className={styles.gradeLabel}>{grade.label}</div>
        </div>
        <div className={styles.summaryStats}>
          <EVReadout label="Your final score" value={bd.grandTotal} unit="pts" tone="optimal" digits={0} />
          <EVReadout label="EV left on the table" value={evLost} unit="pts" tone="data" digits={1} />
          {percentile !== null && (
            <EVReadout label="Beats optimal games" value={percentile * 100} unit="%" tone="data" digits={0} />
          )}
        </div>
      </div>
      <p className={styles.summaryNote}>
        Optimal play averages <span className="tnum">254.59</span>. Your decisions gave up{" "}
        <span className="tnum">{evLost.toFixed(1)}</span> expected points versus perfect play — the
        rest is the dice.
        {percentile !== null && (
          <>
            {" "}
            That final score beats <span className="tnum">{Math.round(percentile * 100)}%</span> of
            games played to perfection.
          </>
        )}
      </p>
      <Button variant="primary" onClick={onNewGame}>
        Play again
      </Button>
    </Panel>
  );
}
