/** Formats ParsedDiff into a Groq-ready prompt string with truncation and filtering. */

import {
  MAX_DIFF_CHAR_LIMIT,
  MAX_FILE_SIZE_LINES,
  SKIPPABLE_FILE_PATTERNS,
} from '../config/constants';
import type { ParsedChange, ParsedDiff, ParsedFile } from '../types/diff';

function matchesSkippablePattern(filename: string, pattern: string): boolean {
  if (pattern.startsWith('*')) {
    return filename.endsWith(pattern.slice(1));
  }
  return filename.includes(pattern);
}

function isSkippableFile(filename: string): boolean {
  return SKIPPABLE_FILE_PATTERNS.some((pattern) => matchesSkippablePattern(filename, pattern));
}

function countFileLines(file: ParsedFile): number {
  return file.chunks.reduce((sum, chunk) => sum + chunk.changes.length, 0);
}

function getReviewableFiles(parsedDiff: ParsedDiff): ParsedFile[] {
  return parsedDiff.files.filter(
    (file) =>
      !isSkippableFile(file.filename) &&
      file.additions > 0 &&
      countFileLines(file) <= MAX_FILE_SIZE_LINES,
  );
}

function formatChangeLine(change: ParsedChange): string {
  const prefix = change.type === 'add' ? '+' : ' ';
  const lineNumber = change.newLineNumber ?? change.lineNumber;
  return `Line ${lineNumber}: ${prefix} ${change.content}`;
}

function formatFileSection(file: ParsedFile): string {
  const header = `=== FILE: ${file.filename} (${file.status}, +${file.additions} -${file.deletions}) ===`;
  const lines: string[] = [header];

  for (const chunk of file.chunks) {
    for (const change of chunk.changes) {
      if (change.type === 'del') {
        continue;
      }
      lines.push(formatChangeLine(change));
    }
  }

  return lines.join('\n');
}

export function countReviewableLines(parsedDiff: ParsedDiff): number {
  return getReviewableFiles(parsedDiff).reduce(
    (total, file) =>
      total +
      file.chunks.reduce(
        (chunkTotal, chunk) =>
          chunkTotal + chunk.changes.filter((change) => change.type === 'add').length,
        0,
      ),
    0,
  );
}

export function formatDiffForPrompt(parsedDiff: ParsedDiff): string {
  const reviewableFiles = getReviewableFiles(parsedDiff);
  const sections: string[] = [];
  let charCount = 0;
  let truncatedCount = 0;

  for (const file of reviewableFiles) {
    const section = formatFileSection(file);
    const sectionWithBreak = sections.length > 0 ? `\n\n${section}` : section;
    const projectedLength = charCount + sectionWithBreak.length;

    if (projectedLength > MAX_DIFF_CHAR_LIMIT) {
      truncatedCount = reviewableFiles.length - sections.length;
      break;
    }

    sections.push(section);
    charCount = projectedLength;
  }

  if (sections.length === 0) {
    return '';
  }

  let result = sections.join('\n\n');
  if (truncatedCount > 0) {
    result += `\n\n... ${truncatedCount} more files truncated due to size limit`;
  }

  return result;
}
