/** Groq-powered AI code review: triage pass plus chunked deep analysis of parsed diffs. */

import crypto from 'crypto';
import Groq from 'groq-sdk';
import { z } from 'zod';
import {
  GROQ_MAX_COMPLETION_TOKENS,
  GROQ_MODEL,
  GROQ_TOOL_NAME,
  MAX_DIFF_CHUNK_CHAR_LIMIT,
  MAX_ISSUES_PER_PR,
  TRIAGE_MAX_COMPLETION_TOKENS,
  TRIAGE_MAX_FILES,
} from '../config/constants';
import { env } from '../config/env';
import type {
  AnalysisResult,
  DetectedIssue,
  IssueCategory,
  IssueSeverity,
} from '../types/analysis';
import type { ParsedDiff, ParsedFile, ParsedFileStatus } from '../types/diff';
import {
  countReviewableLines,
  formatDiffForPrompt,
  getReviewableFiles,
} from '../utils/diffFormatter';
import logger from '../utils/logger';

const ISSUE_CATEGORIES = [
  'security',
  'performance',
  'error-handling',
  'code-quality',
  'type-safety',
  'logic',
  'best-practices',
] as const;

const ISSUE_SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;

const rawIssueSchema = z.object({
  file: z.string(),
  line: z.number(),
  category: z.string(),
  severity: z.string(),
  title: z.string(),
  explanation: z.string(),
  suggestion: z.string(),
  codeSnippet: z.string(),
});

const toolResponseSchema = z.object({
  issues: z.array(rawIssueSchema),
});

const SEVERITY_ORDER: Record<IssueSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

type TriageFileInput = {
  filename: string;
  additions: number;
  deletions: number;
  status: ParsedFileStatus;
};

const codeReviewTool = {
  type: 'function' as const,
  function: {
    name: GROQ_TOOL_NAME,
    description: 'Report all code issues found in the pull request diff',
    parameters: {
      type: 'object',
      properties: {
        issues: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              file: { type: 'string', description: 'Exact filename as shown in the diff' },
              line: { type: 'number', description: 'Line number in the new file' },
              category: {
                type: 'string',
                enum: [...ISSUE_CATEGORIES],
              },
              severity: {
                type: 'string',
                enum: [...ISSUE_SEVERITIES],
              },
              title: { type: 'string', description: 'Short issue title, max 60 chars' },
              explanation: {
                type: 'string',
                description: 'Clear explanation of why this is a problem',
              },
              suggestion: { type: 'string', description: 'Concrete actionable fix' },
              codeSnippet: { type: 'string', description: 'The exact problematic line of code' },
            },
            required: [
              'file',
              'line',
              'category',
              'severity',
              'title',
              'explanation',
              'suggestion',
              'codeSnippet',
            ],
          },
        },
      },
      required: ['issues'],
    },
  },
};

const SYSTEM_PROMPT = `You are an expert code reviewer with deep knowledge of TypeScript, JavaScript, Node.js, security vulnerabilities, and software engineering best practices.

You are reviewing a pull request diff. Your job is to identify REAL, SIGNIFICANT code issues — not style nitpicks.

WHAT TO FLAG:
- Security vulnerabilities (SQL injection, XSS, missing auth checks, exposed secrets, unsafe deserialization)
- Unhandled promise rejections or missing error handling
- Logic errors that would cause bugs at runtime
- Performance issues (N+1 queries, blocking operations, memory leaks)
- Type safety violations (unsafe casts, missing null checks, any types)
- Missing input validation on user-supplied data
- Race conditions or concurrency issues

WHAT TO IGNORE:
- Code style preferences (formatting, naming conventions)
- Minor refactoring suggestions
- Comments or documentation
- Lines you cannot see (only review what is in the diff)
- Deleted lines (lines starting with -)

RULES:
- Only report issues on ADDED lines (Line N: + ...) 
- Be precise: reference the exact line number and filename from the diff
- Maximum ${MAX_ISSUES_PER_PR} issues total — prioritize by severity
- If the code looks correct and safe, return an empty issues array
- Do not invent issues that aren't clearly present in the code`;

const TRIAGE_SYSTEM_PROMPT =
  'You are a code review triage assistant. Return only a valid JSON array of filenames, nothing else.';

function isIssueCategory(value: string): value is IssueCategory {
  return (ISSUE_CATEGORIES as readonly string[]).includes(value);
}

function isIssueSeverity(value: string): value is IssueSeverity {
  return (ISSUE_SEVERITIES as readonly string[]).includes(value);
}

function mapRawIssue(raw: z.infer<typeof rawIssueSchema>): DetectedIssue | null {
  if (!raw.file.trim()) {
    return null;
  }
  if (!Number.isInteger(raw.line) || raw.line <= 0) {
    return null;
  }

  const category = isIssueCategory(raw.category) ? raw.category : 'code-quality';
  const severity = isIssueSeverity(raw.severity) ? raw.severity : 'medium';
  const title =
    raw.title.length > 60 ? `${raw.title.slice(0, 57)}...` : raw.title;

  return {
    id: crypto.randomUUID(),
    file: raw.file,
    line: raw.line,
    category,
    severity,
    title,
    explanation: raw.explanation,
    suggestion: raw.suggestion,
    codeSnippet: raw.codeSnippet,
  };
}

function sortBySeverity(issues: DetectedIssue[]): DetectedIssue[] {
  return [...issues].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
}

function buildEmptyResult(parsedDiff: ParsedDiff): AnalysisResult {
  return {
    prNumber: parsedDiff.prNumber,
    repo: parsedDiff.repo,
    headSha: parsedDiff.headSha,
    issues: [],
    filesAnalyzed: 0,
    analyzedAt: new Date().toISOString(),
    modelUsed: GROQ_MODEL,
    tokensUsed: 0,
  };
}

/** Builds the triage user prompt listing PR metadata and changed files. */
function buildTriagePrompt(params: {
  prTitle: string;
  prDescription: string;
  files: TriageFileInput[];
}): string {
  const description = params.prDescription.trim() || '(none)';
  const fileLines = params.files
    .map((f) => `- ${f.filename} (+${f.additions} -${f.deletions})`)
    .join('\n');

  return `PR Title: ${params.prTitle}
PR Description: ${description}

Changed files:
${fileLines}

Return a JSON array of filenames ranked by review priority.
Focus on files most likely to contain bugs, security issues, or logic errors.
Skip generated files, lock files, style files, test files.
Return maximum ${TRIAGE_MAX_FILES} filenames.`;
}

/** Extracts a JSON string array from model output, tolerating markdown wrappers. */
function parseTriageFilenames(content: string): string[] | null {
  const trimmed = content.trim();

  const tryParse = (text: string): string[] | null => {
    try {
      const parsed: unknown = JSON.parse(text);
      if (
        Array.isArray(parsed) &&
        parsed.every((entry) => typeof entry === 'string')
      ) {
        return parsed;
      }
    } catch {
      return null;
    }
    return null;
  };

  const direct = tryParse(trimmed);
  if (direct) {
    return direct;
  }

  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    return tryParse(arrayMatch[0]);
  }

  return null;
}

/** Returns top files by addition count when AI triage is unavailable. */
function fallbackTriageFilenames(files: TriageFileInput[]): string[] {
  return [...files]
    .sort((a, b) => b.additions - a.additions)
    .slice(0, TRIAGE_MAX_FILES)
    .map((f) => f.filename);
}

/** Orders reviewable files according to the triage-ranked filename list. */
function selectFilesForReview(
  reviewableFiles: ParsedFile[],
  prioritizedFilenames: string[],
): ParsedFile[] {
  const byName = new Map(reviewableFiles.map((f) => [f.filename, f]));
  const selected: ParsedFile[] = [];

  for (const filename of prioritizedFilenames) {
    const file = byName.get(filename);
    if (file) {
      selected.push(file);
    }
    if (selected.length >= TRIAGE_MAX_FILES) {
      break;
    }
  }

  return selected;
}

/** Splits a formatted diff into chunks under the character limit on file boundaries. */
function splitFormattedDiffIntoChunks(formatted: string, maxChars: number): string[] {
  if (formatted.length <= maxChars) {
    return [formatted];
  }

  const sections = formatted.split(/\n\n(?=== FILE:)/);
  const chunks: string[] = [];
  let current = '';

  for (const section of sections) {
    const piece = current.length > 0 ? `\n\n${section}` : section;

    if (piece.length > maxChars) {
      if (current.length > 0) {
        chunks.push(current);
        current = '';
      }
      chunks.push(section);
      continue;
    }

    if (current.length + piece.length > maxChars && current.length > 0) {
      chunks.push(current);
      current = section;
    } else {
      current = current.length > 0 ? `${current}\n\n${section}` : section;
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks.length > 0 ? chunks : [formatted];
}

/** Removes duplicate issues that share the same file and line. */
function dedupeIssues(issues: DetectedIssue[]): DetectedIssue[] {
  const seen = new Set<string>();
  const result: DetectedIssue[] = [];

  for (const issue of issues) {
    const key = `${issue.file}:${issue.line}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(issue);
  }

  return result;
}

export class GroqAnalysisService {
  private readonly groq: Groq;

  constructor() {
    this.groq = new Groq({ apiKey: env.GROQ_API_KEY });
  }

  /** Ranks changed files by review priority using a lightweight Groq completion. */
  private async triageFiles(params: {
    prTitle: string;
    prDescription: string;
    files: TriageFileInput[];
  }): Promise<string[]> {
    if (params.files.length === 0) {
      return [];
    }

    if (params.files.length <= TRIAGE_MAX_FILES) {
      return params.files.map((f) => f.filename);
    }

    const prompt = buildTriagePrompt(params);

    try {
      const response = await this.groq.chat.completions.create({
        model: GROQ_MODEL,
        max_tokens: TRIAGE_MAX_COMPLETION_TOKENS,
        messages: [
          { role: 'system', content: TRIAGE_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Triage response had no content');
      }

      const parsed = parseTriageFilenames(content);
      if (!parsed || parsed.length === 0) {
        throw new Error('Triage response was not a valid JSON filename array');
      }

      const knownFilenames = new Set(params.files.map((f) => f.filename));
      const selected = parsed
        .filter((name) => knownFilenames.has(name))
        .slice(0, TRIAGE_MAX_FILES);

      if (selected.length === 0) {
        throw new Error('Triage returned no known filenames');
      }

      logger.info('Triage complete', {
        totalFiles: params.files.length,
        selectedFiles: selected.length,
        prTitle: params.prTitle,
      });

      return selected;
    } catch (error) {
      logger.warn('Triage failed, falling back to additions sort', {
        prTitle: params.prTitle,
        error: error instanceof Error ? error.message : String(error),
      });

      const fallback = fallbackTriageFilenames(params.files);
      logger.info('Triage complete', {
        totalFiles: params.files.length,
        selectedFiles: fallback.length,
        prTitle: params.prTitle,
      });
      return fallback;
    }
  }

  /** Runs tool-calling Groq analysis on a single formatted diff chunk. */
  private async analyzeChunk(
    formattedChunk: string,
    parsedDiff: ParsedDiff,
  ): Promise<{ issues: DetectedIssue[]; tokensUsed: number }> {
    const response = await this.groq.chat.completions.create({
      model: GROQ_MODEL,
      max_tokens: GROQ_MAX_COMPLETION_TOKENS,
      tools: [codeReviewTool],
      tool_choice: { type: 'function', function: { name: GROQ_TOOL_NAME } },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Review this pull request diff:\n\n${formattedChunk}`,
        },
      ],
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.type !== 'function') {
      throw new Error('Groq did not return a tool call response');
    }

    let parsedResponse: unknown;
    try {
      parsedResponse = JSON.parse(toolCall.function.arguments);
    } catch {
      logger.error('Failed to parse Groq tool call response', {
        rawArguments: toolCall.function.arguments,
        repo: parsedDiff.repo,
        prNumber: parsedDiff.prNumber,
      });
      throw new Error('Failed to parse Groq tool call response');
    }

    const validated = toolResponseSchema.safeParse(parsedResponse);
    if (!validated.success) {
      logger.error('Groq tool call response failed validation', {
        issues: validated.error.issues,
        repo: parsedDiff.repo,
        prNumber: parsedDiff.prNumber,
      });
      throw new Error('Failed to parse Groq tool call response');
    }

    const issues = validated.data.issues
      .map((raw) => mapRawIssue(raw))
      .filter((issue): issue is DetectedIssue => issue !== null);

    return {
      issues,
      tokensUsed: response.usage?.total_tokens ?? 0,
    };
  }

  async analyzeDiff(parsedDiff: ParsedDiff): Promise<AnalysisResult> {
    try {
      const reviewableFiles = getReviewableFiles(parsedDiff);

      if (reviewableFiles.length === 0) {
        logger.info('No reviewable lines in diff, skipping analysis', {
          repo: parsedDiff.repo,
          prNumber: parsedDiff.prNumber,
        });
        return buildEmptyResult(parsedDiff);
      }

      const prioritizedFilenames = await this.triageFiles({
        prTitle: parsedDiff.prTitle,
        prDescription: parsedDiff.prDescription,
        files: reviewableFiles.map((f) => ({
          filename: f.filename,
          additions: f.additions,
          deletions: f.deletions,
          status: f.status,
        })),
      });

      logger.info('Two-pass review started', {
        totalFiles: parsedDiff.files.length,
        prioritizedFiles: prioritizedFilenames.length,
        repo: parsedDiff.repo,
        prNumber: parsedDiff.prNumber,
      });

      const filesToReview = selectFilesForReview(reviewableFiles, prioritizedFilenames);
      const reviewableLines = countReviewableLines(filesToReview);
      const formattedDiff = formatDiffForPrompt(parsedDiff, filesToReview);

      if (reviewableLines === 0 || formattedDiff.length === 0) {
        logger.info('No reviewable lines in prioritized files, skipping analysis', {
          repo: parsedDiff.repo,
          prNumber: parsedDiff.prNumber,
          reviewableLines,
        });
        return buildEmptyResult(parsedDiff);
      }

      const chunks =
        formattedDiff.length > MAX_DIFF_CHUNK_CHAR_LIMIT
          ? splitFormattedDiffIntoChunks(formattedDiff, MAX_DIFF_CHUNK_CHAR_LIMIT)
          : [formattedDiff];

      const allIssues: DetectedIssue[] = [];
      let tokensUsed = 0;

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        try {
          const { issues, tokensUsed: chunkTokens } = await this.analyzeChunk(
            chunks[chunkIndex],
            parsedDiff,
          );
          tokensUsed += chunkTokens;
          allIssues.push(...issues);

          logger.info('Chunk analysis', {
            chunkIndex,
            totalChunks: chunks.length,
            issuesInChunk: issues.length,
            repo: parsedDiff.repo,
            prNumber: parsedDiff.prNumber,
          });
        } catch (chunkError) {
          logger.error('Chunk analysis failed', {
            chunkIndex,
            totalChunks: chunks.length,
            repo: parsedDiff.repo,
            prNumber: parsedDiff.prNumber,
            error:
              chunkError instanceof Error ? chunkError.message : String(chunkError),
          });
        }
      }

      const deduped = dedupeIssues(allIssues);
      const cappedIssues = sortBySeverity(deduped).slice(0, MAX_ISSUES_PER_PR);

      logger.info('Final merged results', {
        totalIssues: allIssues.length,
        afterDedup: deduped.length,
        repo: parsedDiff.repo,
        prNumber: parsedDiff.prNumber,
      });

      logger.info('Groq analysis complete', {
        repo: parsedDiff.repo,
        prNumber: parsedDiff.prNumber,
        issueCount: cappedIssues.length,
        tokensUsed,
        model: GROQ_MODEL,
        chunksAnalyzed: chunks.length,
      });

      return {
        prNumber: parsedDiff.prNumber,
        repo: parsedDiff.repo,
        headSha: parsedDiff.headSha,
        issues: cappedIssues,
        filesAnalyzed: filesToReview.length,
        analyzedAt: new Date().toISOString(),
        modelUsed: GROQ_MODEL,
        tokensUsed,
      };
    } catch (error) {
      logger.error('Groq analysis failed', {
        repo: parsedDiff.repo,
        prNumber: parsedDiff.prNumber,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return buildEmptyResult(parsedDiff);
    }
  }
}

export const groqAnalysisService = new GroqAnalysisService();
