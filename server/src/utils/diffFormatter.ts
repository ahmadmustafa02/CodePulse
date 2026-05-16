/** Formats ParsedDiff into a Groq-ready prompt string with skippable-file filtering. */

import { MAX_FILE_SIZE_LINES, SKIPPABLE_FILE_PATTERNS } from '../config/constants';
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

/** Returns files eligible for review after skippable-pattern and size filtering. */
export function getReviewableFiles(parsedDiff: ParsedDiff): ParsedFile[] {
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

export function countReviewableLines(files: ParsedFile[]): number {
  return files.reduce(
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

/** Formats the given files (or all reviewable files) into a prompt-ready diff string. */
export function formatDiffForPrompt(parsedDiff: ParsedDiff, files?: ParsedFile[]): string {
  const reviewableFiles = files ?? getReviewableFiles(parsedDiff);
  const sections = reviewableFiles.map((file) => formatFileSection(file));

  if (sections.length === 0) {
    return '';
  }

  return sections.join('\n\n');
}
