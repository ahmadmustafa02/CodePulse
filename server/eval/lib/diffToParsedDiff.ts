/** Convert a unified diff string into CodePulse ParsedDiff (eval-only; mirrors GitHubDiffService mapping). */

import parseDiff from 'parse-diff';
import { DEV_NULL_PATH } from '../../src/config/constants';
import type {
  ParsedChange,
  ParsedChangeType,
  ParsedChunk,
  ParsedDiff,
  ParsedFile,
  ParsedFileStatus,
} from '../../src/types/diff';

type ParseDiffFile = ReturnType<typeof parseDiff>[number];
type ParseDiffChunk = ParseDiffFile['chunks'][number];
type ParseDiffChange = ParseDiffChunk['changes'][number];

export type DiffToParsedDiffMeta = {
  caseId: string;
  prTitle: string;
  prDescription: string;
  repo?: string;
  prNumber?: number;
  headSha?: string;
};

function stripChangeContent(content: string): string {
  if (content.length === 0) {
    return content;
  }
  return content.startsWith('+') || content.startsWith('-') || content.startsWith(' ')
    ? content.slice(1)
    : content;
}

function mapChangeType(type: string): ParsedChangeType {
  if (type === 'add' || type === 'del' || type === 'normal') {
    return type;
  }
  return 'normal';
}

function buildParsedChange(
  change: ParseDiffChange,
  currentNewLine: number,
  currentOldLine: number,
): { parsed: ParsedChange; nextNewLine: number; nextOldLine: number } {
  const type = mapChangeType(change.type);
  const content = stripChangeContent(change.content ?? '');

  if (type === 'add') {
    const parsed: ParsedChange = {
      type,
      content,
      lineNumber: currentNewLine,
      newLineNumber: currentNewLine,
      oldLineNumber: null,
    };
    return { parsed, nextNewLine: currentNewLine + 1, nextOldLine: currentOldLine };
  }

  if (type === 'del') {
    const parsed: ParsedChange = {
      type,
      content,
      lineNumber: currentOldLine,
      newLineNumber: null,
      oldLineNumber: currentOldLine,
    };
    return { parsed, nextNewLine: currentNewLine, nextOldLine: currentOldLine + 1 };
  }

  const parsed: ParsedChange = {
    type,
    content,
    lineNumber: currentNewLine,
    newLineNumber: currentNewLine,
    oldLineNumber: currentOldLine,
  };
  return {
    parsed,
    nextNewLine: currentNewLine + 1,
    nextOldLine: currentOldLine + 1,
  };
}

function mapChunk(chunk: ParseDiffChunk): ParsedChunk {
  let currentNewLine = chunk.newStart;
  let currentOldLine = chunk.oldStart;
  const changes: ParsedChange[] = [];

  for (const change of chunk.changes) {
    const result = buildParsedChange(change, currentNewLine, currentOldLine);
    changes.push(result.parsed);
    currentNewLine = result.nextNewLine;
    currentOldLine = result.nextOldLine;
  }

  return {
    header: chunk.content,
    oldStart: chunk.oldStart,
    oldLines: chunk.oldLines,
    newStart: chunk.newStart,
    newLines: chunk.newLines,
    changes,
  };
}

function mapFileStatus(file: ParseDiffFile): ParsedFileStatus {
  const from = file.from;
  const to = file.to;
  if (to === DEV_NULL_PATH) {
    return 'deleted';
  }
  if (from === DEV_NULL_PATH) {
    return 'added';
  }
  if (from && to && from !== to) {
    return 'renamed';
  }
  return 'modified';
}

function resolveFilename(file: ParseDiffFile): string {
  if (file.to && file.to !== DEV_NULL_PATH) {
    return file.to;
  }
  if (file.from && file.from !== DEV_NULL_PATH) {
    return file.from;
  }
  return 'unknown';
}

function mapParsedFiles(files: ParseDiffFile[]): ParsedFile[] {
  return files.map((file) => {
    const chunks = file.chunks.map((chunk) => mapChunk(chunk));
    const additions = chunks.reduce(
      (sum, chunk) => sum + chunk.changes.filter((c) => c.type === 'add').length,
      0,
    );
    const deletions = chunks.reduce(
      (sum, chunk) => sum + chunk.changes.filter((c) => c.type === 'del').length,
      0,
    );

    return {
      filename: resolveFilename(file),
      status: mapFileStatus(file),
      additions,
      deletions,
      chunks,
    };
  });
}

/** Parse a unified diff into the same ParsedDiff shape used by GroqAnalysisService. */
export function unifiedDiffToParsedDiff(
  rawDiff: string,
  meta: DiffToParsedDiffMeta,
): ParsedDiff {
  const parsedFiles = parseDiff(rawDiff);
  const files = mapParsedFiles(parsedFiles);
  const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0);
  const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0);

  return {
    prNumber: meta.prNumber ?? 1,
    repo: meta.repo ?? `eval/${meta.caseId}`,
    headSha: meta.headSha ?? `eval-${meta.caseId}`,
    prTitle: meta.prTitle,
    prDescription: meta.prDescription,
    files,
    totalAdditions,
    totalDeletions,
    parsedAt: new Date().toISOString(),
  };
}
