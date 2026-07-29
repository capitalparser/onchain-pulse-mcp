export interface EthValueCaptureQueryInput {
  cutoffDay: string;
  windowDays: 7 | 30 | 90;
  includeRollups: boolean;
}

const UTC_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_WINDOWS = new Set([7, 30, 90]);

function assertQueryInput(input: EthValueCaptureQueryInput): void {
  const parsed = new Date(`${input.cutoffDay}T00:00:00Z`);
  if (
    !UTC_DAY.test(input.cutoffDay) ||
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== input.cutoffDay
  ) {
    throw new Error("Invalid cutoffDay");
  }
  if (!ALLOWED_WINDOWS.has(input.windowDays)) {
    throw new Error("Invalid windowDays");
  }
}

export function buildEthValueCaptureSql(
  input: EthValueCaptureQueryInput,
): string {
  assertQueryInput(input);

  const rollupCtes = input.includeRollups
    ? `,
rollup_aggregates AS (
  SELECT
    name,
    period,
    COUNT(*) AS row_count,
    COUNT_IF(l1_fee_native IS NOT NULL) = COUNT(*) AS l1_present,
    COUNT_IF(data_fee_native IS NOT NULL) = COUNT(*) AS data_present,
    COUNT_IF(blob_fee_native IS NOT NULL) = COUNT(*) AS blob_present,
    COUNT_IF(verification_fee_native IS NOT NULL) = COUNT(*) AS verification_present,
    SUM(l1_fee_native) AS l1_fee_sum,
    SUM(data_fee_native) AS data_fee_sum,
    SUM(blob_fee_native) AS blob_fee_sum,
    SUM(verification_fee_native) AS verification_fee_sum
  FROM l2_rows
  GROUP BY name, period
),
rollup_periods AS (
  SELECT
    name,
    period,
    CASE WHEN row_count > 0 AND l1_present
      THEN l1_fee_sum ELSE CAST(NULL AS DOUBLE) END AS l2_rent_paid_eth,
    CASE WHEN row_count > 0 AND data_present
      THEN data_fee_sum ELSE CAST(NULL AS DOUBLE) END AS l2_calldata_fee_eth,
    CASE WHEN row_count > 0 AND blob_present
      THEN blob_fee_sum ELSE CAST(NULL AS DOUBLE) END AS l2_blob_fee_eth,
    CASE WHEN row_count > 0 AND verification_present
      THEN verification_fee_sum ELSE CAST(NULL AS DOUBLE) END AS l2_verification_fee_eth,
    row_count > 0
      AND l1_present
      AND data_present
      AND blob_present
      AND verification_present
      AND ABS(
        l1_fee_sum - (data_fee_sum + blob_fee_sum + verification_fee_sum)
      ) <= 0.000000001 AS l2_reconciled
  FROM rollup_aggregates
)`
    : "";

  const rollupRows = input.includeRollups
    ? `
UNION ALL
SELECT
  'rollup' AS row_type,
  name AS rollup,
  period,
  CAST(NULL AS DOUBLE) AS gross_l1_fees_eth,
  CAST(NULL AS DOUBLE) AS base_fee_burn_eth,
  CAST(NULL AS DOUBLE) AS blob_fee_burn_eth,
  CAST(NULL AS DOUBLE) AS priority_fee_eth,
  l2_rent_paid_eth,
  l2_calldata_fee_eth,
  l2_blob_fee_eth,
  l2_verification_fee_eth,
  CAST(NULL AS BOOLEAN) AS base_component_present,
  CAST(NULL AS BOOLEAN) AS blob_component_present,
  CAST(NULL AS BOOLEAN) AS priority_component_present,
  l2_reconciled
FROM rollup_periods`
    : "";

  return `WITH
bounds AS (
  SELECT
    DATE '${input.cutoffDay}' AS cutoff_day,
    DATE_ADD('day', -${input.windowDays}, DATE '${input.cutoffDay}') AS current_start,
    DATE_ADD('day', -${input.windowDays * 2}, DATE '${input.cutoffDay}') AS previous_start
),
period_spine(period) AS (
  VALUES ('current'), ('previous')
),
fee_rows AS (
  SELECT
    CASE
      WHEN block_date >= bounds.current_start THEN 'current'
      ELSE 'previous'
    END AS period,
    tx_fee_breakdown
  FROM gas.fees
  CROSS JOIN bounds
  WHERE blockchain = 'ethereum'
    AND block_month >= CAST(DATE_TRUNC('month', bounds.previous_start) AS DATE)
    AND block_date >= bounds.previous_start
    AND block_date < bounds.cutoff_day
),
fee_aggregates AS (
  SELECT
    period,
    COUNT(*) AS row_count,
    COUNT_IF(element_at(tx_fee_breakdown, 'base_fee') IS NOT NULL) > 0
      AS base_component_present,
    COUNT_IF(element_at(tx_fee_breakdown, 'blob_fee') IS NOT NULL) > 0
      AS blob_component_present,
    COUNT_IF(element_at(tx_fee_breakdown, 'priority_fee') IS NOT NULL) > 0
      AS priority_component_present,
    SUM(COALESCE(element_at(tx_fee_breakdown, 'base_fee'), 0)) AS base_fee_sum,
    SUM(COALESCE(element_at(tx_fee_breakdown, 'blob_fee'), 0)) AS blob_fee_sum,
    SUM(COALESCE(element_at(tx_fee_breakdown, 'priority_fee'), 0)) AS priority_fee_sum
  FROM fee_rows
  GROUP BY period
),
fee_periods AS (
  SELECT
    period,
    CASE
      WHEN row_count > 0
        AND base_component_present
        AND blob_component_present
        AND priority_component_present
      THEN base_fee_sum + blob_fee_sum + priority_fee_sum
      ELSE CAST(NULL AS DOUBLE)
    END AS gross_l1_fees_eth,
    CASE WHEN row_count > 0 AND base_component_present
      THEN base_fee_sum ELSE CAST(NULL AS DOUBLE) END AS base_fee_burn_eth,
    CASE WHEN row_count > 0 AND blob_component_present
      THEN blob_fee_sum ELSE CAST(NULL AS DOUBLE) END AS blob_fee_burn_eth,
    CASE WHEN row_count > 0 AND priority_component_present
      THEN priority_fee_sum ELSE CAST(NULL AS DOUBLE) END AS priority_fee_eth,
    base_component_present,
    blob_component_present,
    priority_component_present
  FROM fee_aggregates
),
l2_rows AS (
  SELECT
    name,
    CASE
      WHEN CAST(day AS DATE) >= bounds.current_start THEN 'current'
      ELSE 'previous'
    END AS period,
    l1_fee_native,
    data_fee_native,
    blob_fee_native,
    verification_fee_native
  FROM rollup_economics_ethereum.l1_fees
  CROSS JOIN bounds
  WHERE CAST(day AS DATE) >= bounds.previous_start
    AND CAST(day AS DATE) < bounds.cutoff_day
),
l2_aggregates AS (
  SELECT
    period,
    COUNT(*) AS row_count,
    COUNT_IF(l1_fee_native IS NOT NULL) = COUNT(*) AS l1_present,
    COUNT_IF(data_fee_native IS NOT NULL) = COUNT(*) AS data_present,
    COUNT_IF(blob_fee_native IS NOT NULL) = COUNT(*) AS blob_present,
    COUNT_IF(verification_fee_native IS NOT NULL) = COUNT(*) AS verification_present,
    SUM(l1_fee_native) AS l1_fee_sum,
    SUM(data_fee_native) AS data_fee_sum,
    SUM(blob_fee_native) AS blob_fee_sum,
    SUM(verification_fee_native) AS verification_fee_sum
  FROM l2_rows
  GROUP BY period
),
l2_periods AS (
  SELECT
    period,
    CASE WHEN row_count > 0 AND l1_present
      THEN l1_fee_sum ELSE CAST(NULL AS DOUBLE) END AS l2_rent_paid_eth,
    CASE WHEN row_count > 0 AND data_present
      THEN data_fee_sum ELSE CAST(NULL AS DOUBLE) END AS l2_calldata_fee_eth,
    CASE WHEN row_count > 0 AND blob_present
      THEN blob_fee_sum ELSE CAST(NULL AS DOUBLE) END AS l2_blob_fee_eth,
    CASE WHEN row_count > 0 AND verification_present
      THEN verification_fee_sum ELSE CAST(NULL AS DOUBLE) END AS l2_verification_fee_eth,
    row_count > 0
      AND l1_present
      AND data_present
      AND blob_present
      AND verification_present
      AND ABS(
        l1_fee_sum - (data_fee_sum + blob_fee_sum + verification_fee_sum)
      ) <= 0.000000001 AS l2_reconciled
  FROM l2_aggregates
)${rollupCtes}
SELECT
  'summary' AS row_type,
  CAST(NULL AS VARCHAR) AS rollup,
  period_spine.period,
  fee_periods.gross_l1_fees_eth,
  fee_periods.base_fee_burn_eth,
  fee_periods.blob_fee_burn_eth,
  fee_periods.priority_fee_eth,
  l2_periods.l2_rent_paid_eth,
  l2_periods.l2_calldata_fee_eth,
  l2_periods.l2_blob_fee_eth,
  l2_periods.l2_verification_fee_eth,
  COALESCE(fee_periods.base_component_present, FALSE) AS base_component_present,
  COALESCE(fee_periods.blob_component_present, FALSE) AS blob_component_present,
  COALESCE(fee_periods.priority_component_present, FALSE) AS priority_component_present,
  COALESCE(l2_periods.l2_reconciled, FALSE) AS l2_reconciled
FROM period_spine
LEFT JOIN fee_periods ON fee_periods.period = period_spine.period
LEFT JOIN l2_periods ON l2_periods.period = period_spine.period${rollupRows}
ORDER BY row_type, rollup, period`;
}
