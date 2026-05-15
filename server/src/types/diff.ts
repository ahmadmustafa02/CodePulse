/** TypeScript types for parsed unified diff data used in PR review. */

export type ParsedFileStatus = 'added' | 'modified' | 'deleted' | 'renamed';

export type ParsedChangeType = 'add' | 'del' | 'normal';

export type ParsedChange = {
  type: ParsedChangeType;
  content: string;
  lineNumber: number;
  newLineNumber: number | null;
  oldLineNumber: number | null;
};

export type ParsedChunk = {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  changes: ParsedChange[];
};

export type ParsedFile = {
  filename: string;
  status: ParsedFileStatus;
  additions: number;
  deletions: number;
  chunks: ParsedChunk[];
};

export type ParsedDiff = {
  prNumber: number;
  repo: string;
  headSha: string;
  files: ParsedFile[];
  totalAdditions: number;
  totalDeletions: number;
  parsedAt: string;
};
