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
};
