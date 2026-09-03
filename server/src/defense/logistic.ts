/** Binary logistic regression helpers (offline fit + runtime predict). */

export type LogisticWeights = {
  weights: number[];
  bias: number;
};

function sigmoid(z: number): number {
  if (z >= 20) return 1;
  if (z <= -20) return 0;
  return 1 / (1 + Math.exp(-z));
}

/** L2-normalize a vector (in place copy). */
export function l2Normalize(vec: number[]): number[] {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm === 0) return vec.map(() => 0);
  return vec.map((v) => v / norm);
}

export function predictProbability(embedding: number[], model: LogisticWeights): number {
  if (embedding.length !== model.weights.length) {
    throw new Error(
      `Logistic dim mismatch: embedding=${embedding.length} weights=${model.weights.length}`,
    );
  }
  const x = l2Normalize(embedding);
  let z = model.bias;
  for (let i = 0; i < x.length; i += 1) {
    z += model.weights[i] * x[i];
  }
  return sigmoid(z);
}

/**
 * Fit binary logistic regression with L2 regularization via batch gradient descent.
 * Labels: 1 = malicious, 0 = safe. Features are L2-normalized.
 */
export function fitLogisticRegression(
  embeddings: number[][],
  labels: number[],
  options?: { epochs?: number; learningRate?: number; l2?: number },
): LogisticWeights & { trainAccuracy: number; trainLoss: number } {
  if (embeddings.length === 0 || embeddings.length !== labels.length) {
    throw new Error('fitLogisticRegression: empty or mismatched inputs');
  }
  const dim = embeddings[0].length;
  const xs = embeddings.map(l2Normalize);
  const epochs = options?.epochs ?? 400;
  const lr = options?.learningRate ?? 0.5;
  const l2 = options?.l2 ?? 1e-3;
  const n = xs.length;

  const weights = new Array<number>(dim).fill(0);
  let bias = 0;

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const gradW = new Array<number>(dim).fill(0);
    let gradB = 0;
    for (let i = 0; i < n; i += 1) {
      const x = xs[i];
      let z = bias;
      for (let j = 0; j < dim; j += 1) z += weights[j] * x[j];
      const p = sigmoid(z);
      const err = p - labels[i];
      for (let j = 0; j < dim; j += 1) gradW[j] += err * x[j];
      gradB += err;
    }
    for (let j = 0; j < dim; j += 1) {
      gradW[j] = gradW[j] / n + l2 * weights[j];
      weights[j] -= lr * gradW[j];
    }
    bias -= lr * (gradB / n);
  }

  let correct = 0;
  let loss = 0;
  for (let i = 0; i < n; i += 1) {
    const p = predictProbability(embeddings[i], { weights, bias });
    const y = labels[i];
    const pred = p >= 0.5 ? 1 : 0;
    if (pred === y) correct += 1;
    const eps = 1e-9;
    loss += -(y * Math.log(p + eps) + (1 - y) * Math.log(1 - p + eps));
  }

  return {
    weights,
    bias,
    trainAccuracy: correct / n,
    trainLoss: loss / n,
  };
}

/**
 * Suggest probability thresholds from training scores.
 * block: high enough that almost no safe examples pass; flag: lower observe band.
 */
export function recommendProbabilityThresholds(
  probs: number[],
  labels: number[],
): { block: number; flag: number } {
  const safeProbs = probs.filter((_, i) => labels[i] === 0).sort((a, b) => a - b);
  const malProbs = probs.filter((_, i) => labels[i] === 1).sort((a, b) => a - b);
  const safeP95 =
    safeProbs.length === 0
      ? 0.4
      : safeProbs[Math.min(safeProbs.length - 1, Math.floor(safeProbs.length * 0.95))];
  const malP10 =
    malProbs.length === 0
      ? 0.6
      : malProbs[Math.min(malProbs.length - 1, Math.floor(malProbs.length * 0.1))];

  let block = Math.max(0.7, Math.min(0.95, (safeP95 + malP10) / 2 + 0.15));
  let flag = Math.max(0.35, Math.min(block - 0.05, safeP95 + 0.05));
  if (flag >= block) {
    flag = Math.max(0.3, block - 0.1);
  }
  // Round for stable env defaults
  block = Math.round(block * 100) / 100;
  flag = Math.round(flag * 100) / 100;
  return { block, flag };
}
