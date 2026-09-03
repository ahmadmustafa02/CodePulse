/**
 * Offline unit check for logistic helpers (no OpenAI).
 * Usage: npx ts-node src/defense/scripts/checkLogistic.ts
 */

import {
  fitLogisticRegression,
  predictProbability,
  recommendProbabilityThresholds,
} from '../logistic';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function main(): void {
  // Separable 2D toy data
  const embeddings = [
    [1, 0],
    [0.9, 0.1],
    [0.8, 0],
    [-1, 0],
    [-0.9, -0.1],
    [-0.8, 0],
  ];
  const labels = [1, 1, 1, 0, 0, 0];
  const fitted = fitLogisticRegression(embeddings, labels, {
    epochs: 200,
    learningRate: 1,
    l2: 1e-4,
  });
  assert(fitted.trainAccuracy >= 0.99, `expected high trainAcc, got ${fitted.trainAccuracy}`);

  const pMal = predictProbability([1, 0], fitted);
  const pSafe = predictProbability([-1, 0], fitted);
  assert(pMal > 0.7, `malicious score too low: ${pMal}`);
  assert(pSafe < 0.3, `safe score too high: ${pSafe}`);

  const probs = embeddings.map((e) => predictProbability(e, fitted));
  const thr = recommendProbabilityThresholds(probs, labels);
  assert(thr.flag < thr.block, 'flag must be < block');

  process.stdout.write(
    `checkLogistic OK trainAcc=${fitted.trainAccuracy.toFixed(3)} pMal=${pMal.toFixed(3)} pSafe=${pSafe.toFixed(3)} thr=${JSON.stringify(thr)}\n`,
  );
}

main();
