import type {
  EthRatioMetric,
  EthWindow,
  EthWindowMetric,
} from "./types.js";

export interface PeriodPair {
  current: number | null;
  previous: number | null;
}

export interface FeeMetricInputs {
  baseFeeBurn: PeriodPair;
  blobFeeBurn: PeriodPair;
  priorityFee: PeriodPair;
  l2Rent: PeriodPair;
}

export interface DerivedFeeMetrics {
  grossL1Fees: PeriodPair;
  totalBurn: PeriodPair;
}

function finiteOrNull(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

export function windowToDays(window: EthWindow): 7 | 30 | 90 {
  switch (window) {
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "90d":
      return 90;
  }
}

export function shiftUtcDay(day: string, amount: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function nullableAdd(...values: Array<number | null>): number | null {
  if (values.some((value) => finiteOrNull(value) === null)) return null;
  return values.reduce<number>((sum, value) => sum + (value as number), 0);
}

export function makeEthWindowMetric(
  current: number | null,
  previous: number | null,
): EthWindowMetric {
  const cleanCurrent = finiteOrNull(current);
  const cleanPrevious = finiteOrNull(previous);
  const comparable = cleanCurrent !== null && cleanPrevious !== null;

  return {
    current: cleanCurrent,
    previous: cleanPrevious,
    delta: comparable ? cleanCurrent - cleanPrevious : null,
    pct_change:
      comparable && cleanPrevious !== 0
        ? (cleanCurrent - cleanPrevious) / Math.abs(cleanPrevious)
        : null,
    unit: "ETH",
  };
}

export function makeRatioMetric(
  currentNumerator: number | null,
  currentDenominator: number | null,
  previousNumerator: number | null,
  previousDenominator: number | null,
): EthRatioMetric {
  const current =
    finiteOrNull(currentNumerator) !== null &&
    finiteOrNull(currentDenominator) !== null &&
    currentDenominator !== 0
      ? (currentNumerator as number) / (currentDenominator as number)
      : null;
  const previous =
    finiteOrNull(previousNumerator) !== null &&
    finiteOrNull(previousDenominator) !== null &&
    previousDenominator !== 0
      ? (previousNumerator as number) / (previousDenominator as number)
      : null;

  return {
    current,
    previous,
    delta: current !== null && previous !== null ? current - previous : null,
    unit: "ratio",
  };
}

export function deriveFeeMetrics(input: FeeMetricInputs): DerivedFeeMetrics {
  return {
    grossL1Fees: {
      current: nullableAdd(
        input.baseFeeBurn.current,
        input.blobFeeBurn.current,
        input.priorityFee.current,
      ),
      previous: nullableAdd(
        input.baseFeeBurn.previous,
        input.blobFeeBurn.previous,
        input.priorityFee.previous,
      ),
    },
    totalBurn: {
      current: nullableAdd(input.baseFeeBurn.current, input.blobFeeBurn.current),
      previous: nullableAdd(input.baseFeeBurn.previous, input.blobFeeBurn.previous),
    },
  };
}
