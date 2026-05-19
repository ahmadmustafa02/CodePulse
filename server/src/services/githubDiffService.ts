/** Fetches PR diffs from GitHub and parses them into structured review-ready objects. */

import { Octokit } from '@octokit/rest';
import parseDiff from 'parse-diff';
import { DEV_NULL_PATH, GITHUB_DIFF_MEDIA_FORMAT } from '../config/constants';
import type {
  ParsedChange,
  ParsedChangeType,
  ParsedChunk,
  ParsedDiff,
  ParsedFile,
  ParsedFileStatus,
} from '../types/diff';
import { githubAuthService } from './githubAuthService';
import logger from '../utils/logger';

type FetchAndParseParams = {
  installationId: number;
  owner: string;
  repo: string;
  pullNumber: number;
  headSha: string;
  prTitle: string;
  prDescription: string;
};

type ParseDiffFile = ReturnType<typeof parseDiff>[number];
type ParseDiffChunk = ParseDiffFile['chunks'][number];
type ParseDiffChange = ParseDiffChunk['changes'][number];

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

export class GitHubDiffService {
  private mapFileStatus(file: any): ParsedFileStatus { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (file.new === DEV_NULL_PATH) {
      return 'deleted';
    }
    if (file.old === DEV_NULL_PATH) {
      return 'added';
    }
    if (file.from !== file.to) {
      return 'renamed';
    }
    return 'modified';
  }

  private resolveFilename(file: ParseDiffFile): string {
    if (file.to && file.to !== DEV_NULL_PATH) {
      return file.to;
    }
    if (file.from && file.from !== DEV_NULL_PATH) {
      return file.from;
    }
    return 'unknown';
  }

  private mapParsedFiles(files: ParseDiffFile[]): ParsedFile[] {
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
        filename: this.resolveFilename(file),
        status: this.mapFileStatus(file),
        additions,
        deletions,
        chunks,
      };
    });
  }

  async fetchAndParseDiff(params: FetchAndParseParams): Promise<ParsedDiff> {
    const { installationId, owner, repo, pullNumber, headSha, prTitle, prDescription } = params;
    const token = await githubAuthService.getInstallationToken(installationId);
    const octokit = new Octokit({ auth: token });

    const response = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
      mediaType: { format: GITHUB_DIFF_MEDIA_FORMAT },
    });

    const rawDiff = response.data as unknown as string;
    const parsedFiles = parseDiff(rawDiff);
    const files = this.mapParsedFiles(parsedFiles);

    const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0);
    const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0);

    const result: ParsedDiff = {
      prNumber: pullNumber,
      repo: `${owner}/${repo}`,
      headSha,
      prTitle,
      prDescription,
      files,
      totalAdditions,
      totalDeletions,
      parsedAt: new Date().toISOString(),
    };

    logger.info('PR diff fetched and parsed', {
      repo: result.repo,
      prNumber: pullNumber,
      fileCount: files.length,
      totalAdditions,
      totalDeletions,
    });

    return result;
  }
}

export const githubDiffService = new GitHubDiffService();
