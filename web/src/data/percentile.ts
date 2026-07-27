/**
 * Percentile of a final score against the optimal-play distribution — the fraction of perfect
 * games that score at or below `score`. Reads the binned CDF emitted in `findings.json`
 * (`cdf[i]` = fraction of games with score below the right edge of bin `i`, i.e. below
 * `(i + 1) * binWidth`), linearly interpolating within the bin for a smooth number.
 */
export function scorePercentile(cdf: number[], binWidth: number, score: number): number {
  if (cdf.length === 0) return 0;
  if (score <= 0) return 0;

  const j = Math.floor(score / binWidth);
  if (j >= cdf.length) return 1;

  const lower = j > 0 ? cdf[j - 1] : 0; // fraction below this bin
  const upper = cdf[j]; // fraction below the top of this bin
  const frac = (score - j * binWidth) / binWidth; // position within the bin
  return lower + (upper - lower) * frac;
}
