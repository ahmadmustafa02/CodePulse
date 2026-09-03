/** Public types for the injection-defense gate. */

export type InjectionOutcome = 'allow' | 'flag' | 'block';

export type InjectionChunkSource =
  | 'pr_title_body'
  | 'filenames'
  | 'formatted_diff'
  | 'combined';

export type ChunkScore = {
  source: InjectionChunkSource;
  chunkIndex: number;
  scoreMalicious: number;
  scoreSafe: number;
  outcome: InjectionOutcome;
};

export type ScanUntrustedContentInput = {
  title: string;
  body: string;
  filenames: string[];
  formattedDiffPreview: string;
  jobId: string;
  organizationId: string;
  /** GitHub App installation id — used for test-only allowlisting. */
  installationId?: number;
  /** When true, skip InjectionDecision write (eval harness / dry runs). */
  skipPersist?: boolean;
};

export type InjectionGateResult = {
  outcome: InjectionOutcome;
  scoreMalicious: number;
  scoreSafe: number;
  sources: ChunkScore[];
  model: string;
  skipped: boolean;
  decisionId?: string;
};

export type CentroidArtifact = {
  version: 1;
  model: string;
  dimensions: number;
  builtAt: string;
  exampleCounts: { malicious: number; safe: number };
  centroids: {
    malicious: number[];
    safe: number[];
  };
  recommendedThresholds: {
    block: number;
    flag: number;
  };
};

/** Phase 1.5: logistic regression on the same embedding space. */
export type LogisticArtifact = {
  version: 1;
  kind: 'logistic';
  model: string;
  dimensions: number;
  builtAt: string;
  exampleCounts: { malicious: number; safe: number };
  weights: number[];
  bias: number;
  trainMetrics?: { accuracy: number; loss: number };
  recommendedThresholds: {
    block: number;
    flag: number;
  };
};
