import type { ReactNode } from "react";
import { EVReadout, Eyebrow, Panel } from "../../design/components/primitives.js";
import { useFindings } from "../../data/useFindings.js";
import type { Findings } from "../../data/loadFindings.js";
import { ScoreHistogram } from "./ScoreHistogram.js";
import { ContributionBars, type ContribRow } from "./ContributionBars.js";
import styles from "./writeup.module.css";

const pct = (x: number) => `${Math.round(x * 100)}%`;

function prettyCategory(name: string): string {
  return name
    .toLowerCase()
    .split("_")
    .map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function Writeup() {
  const { findings, loading, error } = useFindings();

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <Eyebrow>Analysis · optimal play</Eyebrow>
          <h1 className={styles.h1}>What perfect Yahtzee looks like</h1>
          <p className={styles.lede}>
            Every number below is measured, not guessed: we take the solved strategy and play half
            a million games under it, then read off the distribution. Here is what optimal play
            actually does — and what it means for your own game.
          </p>
        </div>
        {findings && (
          <div className={styles.goldenStat}>
            <div className={`${styles.goldenNum} tnum`}>
              {findings.optimal_expected_score.toFixed(2)}
            </div>
            <div className={styles.goldenCap}>Optimal expected game score</div>
          </div>
        )}
      </header>

      {loading && <div className={styles.status}>Loading findings…</div>}
      {error && (
        <div className={`${styles.status} ${styles.statusErr}`}>
          Couldn’t load the findings: {error.message}
        </div>
      )}

      {findings && <Content f={findings} />}

      <footer className={styles.footer}>
        <span>
          {findings
            ? `${findings.simulation.games.toLocaleString()} simulated games · solver mean ${findings.simulation.mean.toFixed(
                2,
              )} vs. exact ${findings.optimal_expected_score.toFixed(2)}`
            : "Monte Carlo over the optimal policy"}
        </span>
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

function Content({ f }: { f: Findings }) {
  const p = f.probabilities;
  const s = f.simulation;
  const median = s.percentiles.p50;

  const byCat = new Map(f.category_contribution.map((c) => [c.category, c]));
  const zero = (cat: string) => (byCat.get(cat)?.zero_rate ?? 0);

  const contribRows: ContribRow[] = [
    ...f.category_contribution.map((c) => ({
      label: prettyCategory(c.category),
      value: c.mean,
      tone: "data" as const,
    })),
    { label: "Upper bonus", value: f.bonus_contribution.upper_bonus_mean, tone: "optimal" as const },
    { label: "Yahtzee bonus", value: f.bonus_contribution.yahtzee_bonus_mean, tone: "optimal" as const },
  ].sort((a, b) => b.value - a.value);

  return (
    <>
      <div className={styles.tiles}>
        <Tile
          label="Optimal expected score"
          value={f.optimal_expected_score}
          digits={2}
          tone="optimal"
          caption="Reproduces the known 254.59 benchmark from our own DP."
        />
        <Tile
          label="Typical game (median)"
          value={median}
          digits={0}
          tone="data"
          caption="Half of all perfect games score below this."
        />
        <Tile
          label="Upper-bonus rate"
          value={p.upper_bonus * 100}
          unit="%"
          digits={0}
          tone="data"
          caption="How often optimal play banks the +35."
        />
        <Tile
          label="Yahtzee rate"
          value={p.at_least_one_yahtzee * 100}
          unit="%"
          digits={0}
          tone="data"
          caption="Games with at least one 50 in the Yahtzee box."
        />
      </div>

      <Panel eyebrow={`${s.games.toLocaleString()} games`} title="The score distribution">
        <ScoreHistogram
          edges={f.distribution.edges}
          counts={f.distribution.counts}
          binWidth={f.distribution.bin_width}
          mean={s.mean}
          median={median}
        />
        <p className={styles.caption}>
          Right-skewed: the median is <b className="tnum">{median.toFixed(0)}</b> but the mean is{" "}
          <b className="tnum">{s.mean.toFixed(0)}</b>, pulled up by rare Yahtzee-bonus blowouts (the
          long tail runs to <b className="tnum">{s.max}</b>). The middle 80% of perfect games span{" "}
          <b className="tnum">{s.percentiles.p10.toFixed(0)}</b>–
          <b className="tnum">{s.percentiles.p90.toFixed(0)}</b>.
        </p>
      </Panel>

      <Panel eyebrow="mean points per box" title="Where the points come from">
        <ContributionBars rows={contribRows} />
        <p className={styles.caption}>
          The reliable lower boxes (straights, full house) and the upper bonus carry the score.
          Aces contribute barely{" "}
          <b className="tnum">{(byCat.get("ACES")?.mean ?? 0).toFixed(1)}</b> points on average —
          don’t agonize over them.
        </p>
      </Panel>

      <Panel eyebrow="read from the solver" title="How to actually score higher">
        <div className={styles.insights}>
          <Insight title="The upper section is the real game">
            Optimal play banks the +35 upper bonus in <b>{pct(p.upper_bonus)}</b> of games, and it
            alone is worth <b className="tnum">{f.bonus_contribution.upper_bonus_mean.toFixed(0)}</b>{" "}
            of the ~255 points. The shortcut: <b>three of each number</b> (three 1s, three 2s, …)
            totals exactly 63. Protect the upper boxes; don’t fritter them on zeros.
          </Insight>
          <Insight title="Yahtzee is overrated — until it lands">
            Even with perfect play you get a Yahtzee in only <b>{pct(p.at_least_one_yahtzee)}</b> of
            games, and the box is left at zero <b>{pct(zero("YAHTZEE"))}</b> of the time. The juicy
            +100 bonus appears in just <b>{pct(p.yahtzee_bonus_ge1)}</b> of games. Don’t torch good
            turns chasing five-of-a-kind — but once the 50 is in the box, chase every extra one.
          </Insight>
          <Insight title="Taking a zero is normal, not a blunder">
            <b>{pct(p.any_zero_scored)}</b> of optimal games score a zero somewhere. The usual
            sacrifices are the Yahtzee box, Four of a Kind (<b>{pct(zero("FOUR_OF_A_KIND"))}</b>{" "}
            zeroed) and Large Straight (<b>{pct(zero("LARGE_STRAIGHT"))}</b>). A strategic zero in a
            hard box beats forcing a bad score into an easy one.
          </Insight>
          <Insight title="Don’t judge a game by one number">
            The spread is huge even for a flawless player: scores run from{" "}
            <b className="tnum">{s.min}</b> to <b className="tnum">{s.max}</b>, standard deviation{" "}
            <b className="tnum">{s.std.toFixed(0)}</b>. A 230 isn’t bad play — it’s mostly the dice.
            Judge your <i>decisions</i> (the Play tab’s “EV left on the table”), not the total.
          </Insight>
        </div>
      </Panel>

      {f.opening_keeps.length > 0 && (
        <Panel eyebrow="optimal opening keep" title="First-roll cheat sheet">
          <div className={styles.openings}>
            {f.opening_keeps.map((o, i) => (
              <div key={i} className={styles.openRow}>
                <span className={styles.dice}>
                  {o.roll.map((d, j) => (
                    <span key={j} className={styles.mini}>
                      {d}
                    </span>
                  ))}
                </span>
                <span className={styles.keepWord}>keep</span>
                <span className={styles.dice}>
                  {o.keep.map((d, j) => (
                    <span key={j} className={`${styles.mini} ${styles.miniKeep}`}>
                      {d}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
          <p className={styles.caption}>
            Note the counterintuitive one: with <b className="tnum">3 4 5 6 6</b> the solver keeps
            the <b>pair of sixes</b>, not the four-to-a-straight — the pair’s route to the upper
            bonus and three/four-of-a-kind beats the open-ended straight draw.
          </p>
        </Panel>
      )}
    </>
  );
}

function Tile({
  label,
  value,
  unit,
  digits,
  tone,
  caption,
}: {
  label: string;
  value: number;
  unit?: string;
  digits: number;
  tone: "data" | "optimal";
  caption: string;
}) {
  return (
    <div className={styles.tile}>
      <EVReadout label={label} value={value} unit={unit} tone={tone} digits={digits} />
      <p className={styles.tileCap}>{caption}</p>
    </div>
  );
}

function Insight({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.insight}>
      <h3 className={styles.insightTitle}>{title}</h3>
      <p className={styles.insightBody}>{children}</p>
    </div>
  );
}
