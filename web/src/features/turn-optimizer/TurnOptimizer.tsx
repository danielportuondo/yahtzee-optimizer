import { useMemo, useState } from "react";
import type { Recommendation } from "../../engine/index.js";
import { Eyebrow } from "../../design/components/primitives.js";
import { DiceTray } from "./DiceTray.js";
import { RecommendationPanel } from "./RecommendationPanel.js";
import { ScorecardInput } from "./ScorecardInput.js";
import {
  categoriesRemaining,
  deriveTurnState,
  emptyScorecard,
  type Scorecard,
} from "./scorecard.js";
import { useEngine } from "./useEngine.js";
import styles from "./turnOptimizer.module.css";

export function TurnOptimizer() {
  const { engine, loading, error } = useEngine();
  const [dice, setDice] = useState<number[]>([1, 2, 3, 4, 5]);
  const [rollNumber, setRollNumber] = useState<1 | 2 | 3>(1);
  const [card, setCard] = useState<Scorecard>(emptyScorecard);

  const turnState = useMemo(() => deriveTurnState(card), [card]);
  const remaining = categoriesRemaining(card);

  const rec: Recommendation | null = useMemo(() => {
    if (!engine || remaining === 0) return null;
    try {
      return engine.recommend(turnState, dice, rollNumber);
    } catch {
      return null;
    }
  }, [engine, remaining, turnState, dice, rollNumber]);

  const recommendedHeld = useMemo(() => {
    const s = new Set<number>();
    if (rec && rec.kind === "keep") for (const i of rec.best.heldDiceIndices) s.add(i);
    return s;
  }, [rec]);

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <Eyebrow>Optimal solitaire Yahtzee</Eyebrow>
          <h1 className={styles.h1}>Turn Optimizer</h1>
          <p className={styles.lede}>
            Set your dice and where you are in the turn. The optimizer solves the within-turn
            dynamic program live and returns the play that maximizes your expected final score.
          </p>
        </div>
      </header>

      <main className={styles.grid}>
        <div className={styles.stage}>
          <DiceTray
            dice={dice}
            rollNumber={rollNumber}
            recommendedHeld={recommendedHeld}
            onCycleDie={(i, next) => setDice((d) => d.map((v, idx) => (idx === i ? next : v)))}
            onRollNumber={setRollNumber}
            onRandomize={() =>
              setDice(Array.from({ length: 5 }, () => 1 + Math.floor(Math.random() * 6)))
            }
          />
          {loading && <div className={styles.status}>Loading strategy tables…</div>}
          {error && (
            <div className={`${styles.status} ${styles.statusErr}`}>
              Couldn’t load the strategy tables: {error.message}
            </div>
          )}
          {remaining === 0 && !loading && (
            <div className={styles.status}>Scorecard is full — no turn left to optimize.</div>
          )}
          {rec && <RecommendationPanel rec={rec} />}
        </div>

        <aside>
          <ScorecardInput
            card={card}
            onChange={setCard}
            onReset={() => setCard(emptyScorecard())}
          />
        </aside>
      </main>

      <footer className={styles.footer}>
        <span>Two-level DP · reproduces Verhoeff’s 254.59 · engine cross-checked against Python</span>
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
