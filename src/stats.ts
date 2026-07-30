export function mean(xs: readonly number[]): number {
  if (xs.length === 0) throw new Error("mean: empty input");
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function stdev(xs: readonly number[]): number {
  if (xs.length <= 1) return 0;
  const m = mean(xs);
  let acc = 0;
  for (const x of xs) acc += (x - m) ** 2;
  return Math.sqrt(acc / xs.length);
}

export function zScore(x: number, history: readonly number[]): number {
  const sd = stdev(history);
  if (sd === 0) return 0;
  return (x - mean(history)) / sd;
}

export function sigmoid01(x: number): number {
  return 1 / (1 + Math.exp(-x));
}
