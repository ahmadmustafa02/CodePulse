/** Deterministic matching of predicted findings against gold labels. */

import type { DetectedIssue, IssueCategory, IssueSeverity } from '../../src/types/analysis';
import type { ExpectedFinding } from './loadDataset';

const SEVERITY_RANK: Record<IssueSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export type MatchPair = {
  expectedId: string;
  predicted: DetectedIssue;
  score: number;
  lineDistance: number;
  categoryMatch: boolean;
  keywordHits: number;
};

export type CaseMatchResult = {
  truePositives: MatchPair[];
  falsePositives: DetectedIssue[];
  falseNegatives: ExpectedFinding[];
  tp: number;
  fp: number;
  fn: number;
};

function normalizeText(value: string): string {
  return value.toLowerCase();
}

function keywordHits(predicted: DetectedIssue, keywords: string[]): number {
  if (keywords.length === 0) {
    return 0;
  }
  const haystack = normalizeText(
    `${predicted.title}\n${predicted.explanation}\n${predicted.suggestion}\n${predicted.codeSnippet}`,
  );
  let hits = 0;
  for (const keyword of keywords) {
    if (haystack.includes(normalizeText(keyword))) {
      hits += 1;
    }
  }
  return hits;
}

/**
 * Score a candidate pair. Higher is better.
 *
 * Primary gate (caller): same file + |line diff| <= tolerance.
 * Score components:
 * - category match: +100
 * - each keyword hit: +20
 * - closer line: +(10 - distance) clamped
 * - severity meets severityMin (if set): +10
 */
export function scoreCandidate(
  predicted: DetectedIssue,
  expected: ExpectedFinding,
): number {
  const distance = Math.abs(predicted.line - expected.line);
  const categoryMatch = predicted.category === expected.category;
  const hits = keywordHits(predicted, expected.keywords);

  let score = 0;
  if (categoryMatch) score += 100;
  score += hits * 20;
  score += Math.max(0, 10 - distance);

  if (expected.severityMin) {
    const predRank = SEVERITY_RANK[predicted.severity];
    const minRank = SEVERITY_RANK[expected.severityMin];
    if (predRank <= minRank) {
      score += 10;
    }
  }

  return score;
}

function isPrimaryMatch(predicted: DetectedIssue, expected: ExpectedFinding): boolean {
  if (predicted.file !== expected.file) {
    return false;
  }
  return Math.abs(predicted.line - expected.line) <= expected.lineTolerance;
}

/**
 * Greedy 1:1 matching:
 * 1. Enumerate all pairs that pass primary gate (file + lineTolerance).
 * 2. Sort by score descending, then smaller line distance, then expected id.
 * 3. Accept pairs if neither side already matched.
 * 4. Unmatched predictions → FP; unmatched expected → FN.
 */
export function matchFindings(
  predicted: DetectedIssue[],
  expected: ExpectedFinding[],
): CaseMatchResult {
  if (expected.length === 0) {
    return {
      truePositives: [],
      falsePositives: [...predicted],
      falseNegatives: [],
      tp: 0,
      fp: predicted.length,
      fn: 0,
    };
  }

  type Candidate = {
    expectedIndex: number;
    predictedIndex: number;
    score: number;
    lineDistance: number;
    categoryMatch: boolean;
    keywordHits: number;
  };

  const candidates: Candidate[] = [];

  for (let ei = 0; ei < expected.length; ei++) {
    for (let pi = 0; pi < predicted.length; pi++) {
      const exp = expected[ei];
      const pred = predicted[pi];
      if (!isPrimaryMatch(pred, exp)) {
        continue;
      }
      const hits = keywordHits(pred, exp.keywords);
      candidates.push({
        expectedIndex: ei,
        predictedIndex: pi,
        score: scoreCandidate(pred, exp),
        lineDistance: Math.abs(pred.line - exp.line),
        categoryMatch: pred.category === exp.category,
        keywordHits: hits,
      });
    }
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.lineDistance !== b.lineDistance) return a.lineDistance - b.lineDistance;
    return expected[a.expectedIndex].id.localeCompare(expected[b.expectedIndex].id);
  });

  const usedExpected = new Set<number>();
  const usedPredicted = new Set<number>();
  const truePositives: MatchPair[] = [];

  for (const candidate of candidates) {
    if (usedExpected.has(candidate.expectedIndex) || usedPredicted.has(candidate.predictedIndex)) {
      continue;
    }
    // When keywords are provided, require at least one hit OR category match
    // to reduce accidental nearby matches on multi-issue files.
    const exp = expected[candidate.expectedIndex];
    if (exp.keywords.length > 0 && candidate.keywordHits === 0 && !candidate.categoryMatch) {
      continue;
    }

    usedExpected.add(candidate.expectedIndex);
    usedPredicted.add(candidate.predictedIndex);
    truePositives.push({
      expectedId: exp.id,
      predicted: predicted[candidate.predictedIndex],
      score: candidate.score,
      lineDistance: candidate.lineDistance,
      categoryMatch: candidate.categoryMatch,
      keywordHits: candidate.keywordHits,
    });
  }

  const falsePositives = predicted.filter((_, index) => !usedPredicted.has(index));
  const falseNegatives = expected.filter((_, index) => !usedExpected.has(index));

  return {
    truePositives,
    falsePositives,
    falseNegatives,
    tp: truePositives.length,
    fp: falsePositives.length,
    fn: falseNegatives.length,
  };
}

export type CategoryDetection = {
  category: IssueCategory;
  expected: number;
  detected: number;
  detectionRate: number;
};

export type CategoryPrecisionRecall = {
  category: IssueCategory;
  tp: number;
  fp: number;
  fn: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
};

export function categoryDetectionRates(
  pairs: MatchPair[],
  allExpected: ExpectedFinding[],
): CategoryDetection[] {
  const expectedByCategory = new Map<IssueCategory, number>();
  const detectedByCategory = new Map<IssueCategory, number>();

  for (const exp of allExpected) {
    expectedByCategory.set(exp.category, (expectedByCategory.get(exp.category) ?? 0) + 1);
  }

  for (const pair of pairs) {
    const exp = allExpected.find((e) => e.id === pair.expectedId);
    if (!exp) continue;
    detectedByCategory.set(exp.category, (detectedByCategory.get(exp.category) ?? 0) + 1);
  }

  const categories = [...expectedByCategory.keys()].sort();
  return categories.map((category) => {
    const expectedCount = expectedByCategory.get(category) ?? 0;
    const detected = detectedByCategory.get(category) ?? 0;
    return {
      category,
      expected: expectedCount,
      detected,
      detectionRate: expectedCount === 0 ? 0 : detected / expectedCount,
    };
  });
}

/**
 * Per-category precision/recall using gold category for TP/FN and predicted
 * category for FP attribution.
 */
export function categoryPrecisionRecall(
  pairs: MatchPair[],
  falsePositives: DetectedIssue[],
  falseNegatives: ExpectedFinding[],
  allExpected: ExpectedFinding[],
): CategoryPrecisionRecall[] {
  const categories = new Set<IssueCategory>();
  for (const exp of allExpected) categories.add(exp.category);
  for (const fp of falsePositives) categories.add(fp.category);
  for (const fn of falseNegatives) categories.add(fn.category);

  const tpBy = new Map<IssueCategory, number>();
  const fpBy = new Map<IssueCategory, number>();
  const fnBy = new Map<IssueCategory, number>();

  for (const pair of pairs) {
    const exp = allExpected.find((e) => e.id === pair.expectedId);
    if (!exp) continue;
    tpBy.set(exp.category, (tpBy.get(exp.category) ?? 0) + 1);
  }
  for (const fp of falsePositives) {
    fpBy.set(fp.category, (fpBy.get(fp.category) ?? 0) + 1);
  }
  for (const fn of falseNegatives) {
    fnBy.set(fn.category, (fnBy.get(fn.category) ?? 0) + 1);
  }

  const ratio = (n: number, d: number): number | null => (d === 0 ? null : n / d);

  return [...categories].sort().map((category) => {
    const tp = tpBy.get(category) ?? 0;
    const fp = fpBy.get(category) ?? 0;
    const fn = fnBy.get(category) ?? 0;
    const precision = ratio(tp, tp + fp);
    const recall = ratio(tp, tp + fn);
    const f1 =
      precision === null || recall === null || precision + recall === 0
        ? null
        : (2 * precision * recall) / (precision + recall);
    return { category, tp, fp, fn, precision, recall, f1 };
  });
}
