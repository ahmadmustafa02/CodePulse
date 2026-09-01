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
