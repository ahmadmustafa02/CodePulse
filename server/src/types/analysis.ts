/** TypeScript types for Groq AI code review analysis results. */

export type IssueCategory =
  | 'security'
  | 'performance'
  | 'error-handling'
  | 'code-quality'
  | 'type-safety'
  | 'logic'
  | 'best-practices';

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';

export type DetectedIssue = {
  id: string;
  file: string;
  line: number;
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  explanation: string;
  suggestion: string;
  codeSnippet: string;
};

export type AnalysisResult = {
  prNumber: number;
  repo: string;
  headSha: string;
  issues: DetectedIssue[];
  filesAnalyzed: number;
  analyzedAt: string;
  modelUsed: string;
  tokensUsed: number;
  /** Chunks that were attempted during deep analysis. */
  chunksAttempted?: number;
  /** Chunks that threw (tool parse / API errors). Eval treats incomplete analysis as findings-missed. */
  chunksFailed?: number;
  /** True when one or more chunks failed or the outer analysis path soft-failed to empty. */
  analysisIncomplete?: boolean;
  /** True when failures were Groq rate limits (infra) — eval excludes these from P/R rather than scoring as FN. */
  rateLimited?: boolean;
};
