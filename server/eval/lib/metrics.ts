/** Aggregate offline evaluation metrics (finding-level; no fabricated TNs). */

import type { CategoryDetection, CategoryPrecisionRecall } from './matchFindings';

export type AggregateMetrics = {
  tp: number;
  fp: number;
  fn: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  cleanCaseCount: number;
  cleanCasesWithFindings: number;
  cleanCaseFalsePositiveFindings: number;
  cleanCaseFalsePositiveRate: number | null;
  averageLatencyMs: number;
  totalLatencyMs: number;
  averageTokens: number;
  totalTokens: number;
  categoryDetection: CategoryDetection[];
  categoryPrecisionRecall: CategoryPrecisionRecall[];
};

function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

export function computeAggregateMetrics(input: {
  tp: number;
  fp: number;
  fn: number;
  cleanCaseCount: number;
  cleanCasesWithFindings: number;
  cleanCaseFalsePositiveFindings: number;
  latenciesMs: number[];
  tokens: number[];
  categoryDetection: CategoryDetection[];
  categoryPrecisionRecall: CategoryPrecisionRecall[];
}): AggregateMetrics {
  const precision = ratio(input.tp, input.tp + input.fp);
  const recall = ratio(input.tp, input.tp + input.fn);
  const f1 =
    precision === null || recall === null || precision + recall === 0
      ? null
      : (2 * precision * recall) / (precision + recall);

  const totalLatencyMs = input.latenciesMs.reduce((a, b) => a + b, 0);
  const totalTokens = input.tokens.reduce((a, b) => a + b, 0);
  const n = input.latenciesMs.length;

  return {
    tp: input.tp,
    fp: input.fp,
    fn: input.fn,
    precision,
    recall,
    f1,
    cleanCaseCount: input.cleanCaseCount,
    cleanCasesWithFindings: input.cleanCasesWithFindings,
    cleanCaseFalsePositiveFindings: input.cleanCaseFalsePositiveFindings,
    cleanCaseFalsePositiveRate: ratio(input.cleanCasesWithFindings, input.cleanCaseCount),
    averageLatencyMs: n === 0 ? 0 : totalLatencyMs / n,
    totalLatencyMs,
    averageTokens: n === 0 ? 0 : totalTokens / n,
    totalTokens,
    categoryDetection: input.categoryDetection,
    categoryPrecisionRecall: input.categoryPrecisionRecall,
  };
}

export function formatPercent(value: number | null): string {
  if (value === null) return 'n/a';
  return `${(value * 100).toFixed(1)}%`;
}

export function formatNumber(value: number, digits = 2): string {
  return value.toFixed(digits);
}
