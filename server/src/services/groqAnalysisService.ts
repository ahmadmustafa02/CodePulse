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
import type { PipelineTracer } from './traceService';
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

Report only concrete, actionable defects that are supported by evidence in the provided diff/context. Prioritize material correctness, security, reliability, and meaningful performance problems. Every reported issue must be explainable directly from the provided diff/context. If you are uncertain whether something is a real defect, do not report it.

WHAT TO FLAG:
- Security vulnerabilities with clear evidence in the diff (SQL injection, XSS, command injection, exposed secrets, unsafe deserialization, missing auth checks when the code path clearly enforces or bypasses authorization)
- Concrete failure-handling bugs (e.g. swallowed errors that hide failure, missing await that returns a Promise where a value is required, unhandled rejections created by the added code itself)
- Logic errors that would cause bugs at runtime
- Meaningful performance problems (e.g. N+1 queries, clearly expensive blocking work, obvious memory leaks)
- Type safety defects that can cause real runtime failures (e.g. unchecked any that drops required fields, null/undefined dereference)
- Missing input validation only when the diff shows untrusted input reaching a dangerous sink or violating an important invariant/security boundary
- Race conditions or concurrency issues with clear evidence

WHAT TO IGNORE:
- Code style preferences (formatting, naming conventions)
- Minor refactoring suggestions
- Comments or documentation
- Lines you cannot see (only review what is in the diff)
- Deleted lines (lines starting with -)
- Speculative security claims when the vulnerable behavior is not demonstrated (e.g. assumed SSRF on a fixed trusted URL, assumed email header injection, assumed privilege escalation without an authz bypass in the diff)
- Normal TypeScript patterns and harmless casts that do not create a concrete defect
- Requiring try/catch merely because a function can throw or a Promise can reject; error propagation to the caller is valid unless the added code creates a concrete failure-handling bug
- Defensive validation / "validate everything" suggestions without evidence that the input can actually violate an important invariant or security boundary
- Micro-optimizations or resource-reuse nits without meaningful performance impact

RULES:
- Only report issues on ADDED lines (Line N: + ...) 
- Be precise: reference the exact line number and filename from the diff
- Maximum ${MAX_ISSUES_PER_PR} issues total — prioritize by severity
- Multiple findings are allowed when they are genuinely independent and materially actionable; do not invent adjacent nits around a real bug
- If the code looks correct and safe, return an empty issues array
- Do not invent issues that aren't clearly present in the code
- When uncertain, omit the finding`;

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

function buildEmptyResult(
  parsedDiff: ParsedDiff,
  opts?: { analysisIncomplete?: boolean; chunksAttempted?: number; chunksFailed?: number },
): AnalysisResult {
  return {
    prNumber: parsedDiff.prNumber,
    repo: parsedDiff.repo,
    headSha: parsedDiff.headSha,
    issues: [],
    filesAnalyzed: 0,
    analyzedAt: new Date().toISOString(),
    modelUsed: GROQ_MODEL,
    tokensUsed: 0,
    chunksAttempted: opts?.chunksAttempted ?? 0,
    chunksFailed: opts?.chunksFailed ?? 0,
    analysisIncomplete: opts?.analysisIncomplete ?? false,
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRateLimitError(error: unknown): boolean {
  const msg = errorMessage(error);
  return msg.includes('429') || msg.includes('rate_limit');
}

/** Recover empty-intent when Groq rejects tool format but failed_generation says no issues. */
function canRecoverEmptyIssuesFromError(error: unknown): boolean {
  const msg = errorMessage(error);
  const isFormatFailure =
    msg.includes('tool_use_failed') ||
    msg.includes('output_parse_failed') ||
    msg.includes('did not return a tool call') ||
    msg.includes('Failed to parse Groq tool call') ||
    msg.includes('Tool choice is required');
  if (!isFormatFailure || isRateLimitError(error)) return false;

  const fg = extractFailedGenerationInline(msg);
  if (fg && looksLikeEmptyIntentInline(fg)) return true;
  return looksLikeEmptyIntentInline(msg);
}

function extractFailedGenerationInline(message: string): string | null {
  const markers = ['failed_generation\\":\\"', 'failed_generation":"'];
  for (const m of markers) {
    const idx = message.indexOf(m);
    if (idx === -1) continue;
    let i = idx + m.length;
    let out = '';
    while (i < message.length) {
      if (m.includes('\\"')) {
        if (message.startsWith('\\"}', i) || message.startsWith('\\"}}', i)) break;
        if (message[i] === '\\' && i + 1 < message.length) {
          out += message[i] + message[i + 1];
          i += 2;
          continue;
        }
      } else if (message[i] === '"' && message[i - 1] !== '\\') {
        break;
      }
      out += message[i];
      i += 1;
    }
    try {
      return JSON.parse(`"${out}"`);
    } catch {
      return out.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
  }
  return null;
}

function looksLikeEmptyIntentInline(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/\\?"issues\\?"\s*:\s*\[[\s\S]*\{/.test(t) && /category|title|severity/.test(t)) {
    return false;
  }
  if (/\\?"issues\\?"\s*:\s*\[\s*\]/.test(t)) return true;
  if (/```json\s*\{\s*"issues"\s*:\s*\[\s*\]\s*\}\s*```/i.test(t)) return true;
  if (/```json\s*\[\s*\]\s*```/.test(t)) return true;
  if (/^\s*\{\s*"issues"\s*:\s*\[\s*\]\s*\}\s*$/.test(t)) return true;
  if (/^\s*\[\s*\]\s*$/.test(t)) return true;
  if (/no issues? (identified|found|were identified)/i.test(t)) return true;
  if (/no code quality.*issues/i.test(t)) return true;
  if (/no actionable defects/i.test(t)) return true;
  if (/no apparent[\s\S]{0,40}defects/i.test(t)) return true;
  if (/likely no significant issues/i.test(t) || /no significant issues/i.test(t)) return true;
  return false;
}

function rateLimitWaitMs(error: unknown, attempt: number): number {
  const msg = errorMessage(error);
  // Groq: "Please try again in 22m17.472s" or "try again in 12.5s"
  const withMinutes = /try again in (?:(\d+)m)?([\d.]+)s/i.exec(msg);
  if (withMinutes) {
    const minutes = withMinutes[1] ? Number(withMinutes[1]) : 0;
    const seconds = Number(withMinutes[2]);
    const ms = Math.ceil((minutes * 60 + seconds) * 1000) + 2000;
    return Math.min(Math.max(ms, 5000), 45 * 60 * 1000);
  }
  return Math.min(1000 * 2 ** attempt, 60_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GroqAnalysisService {
  private groq: Groq;

  constructor(apiKey: string = env.GROQ_API_KEY) {
    this.groq = new Groq({ apiKey });
  }

  /** Eval-only: swap API key after rate-limit rotation (never log the key). */
  setApiKey(apiKey: string): void {
    this.groq = new Groq({ apiKey });
  }

  /** Ranks changed files by review priority using a lightweight Groq completion. */
  private async triageFiles(params: {
    prTitle: string;
    prDescription: string;
    files: TriageFileInput[];
    model: string;
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
        model: params.model,
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
    model: string,
    opts?: { maxCompletionTokens?: number; abortOnRateLimit?: boolean },
  ): Promise<{ issues: DetectedIssue[]; tokensUsed: number }> {
    const maxAttempts = opts?.abortOnRateLimit ? 1 : 4;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.analyzeChunkOnce(formattedChunk, parsedDiff, model, opts?.maxCompletionTokens);
      } catch (error) {
        lastError = error;
        if (opts?.abortOnRateLimit && isRateLimitError(error)) {
          throw error;
        }
        if (!isRateLimitError(error) || attempt === maxAttempts) {
          throw error;
        }
        const waitMs = rateLimitWaitMs(error, attempt);
        logger.warn('Groq rate limit; backing off before retry', {
          attempt,
          maxAttempts,
          waitMs,
          waitMinutes: Math.round(waitMs / 60000),
          repo: parsedDiff.repo,
          prNumber: parsedDiff.prNumber,
          model,
        });
        await sleep(waitMs);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async analyzeChunkOnce(
    formattedChunk: string,
    parsedDiff: ParsedDiff,
    model: string,
    maxCompletionTokens?: number,
  ): Promise<{ issues: DetectedIssue[]; tokensUsed: number }> {
    const stricterSuffix =
      '\n\nIMPORTANT: You MUST call the report_code_issues tool. ' +
      'If there are no issues, call it with {"issues": []}. Do not reply in prose or raw JSON.';

    const attemptOnce = async (extraUserSuffix: string) => {
      const response = await this.groq.chat.completions.create({
        model,
        max_tokens: maxCompletionTokens ?? GROQ_MAX_COMPLETION_TOKENS,
        tools: [codeReviewTool],
        tool_choice: { type: 'function', function: { name: GROQ_TOOL_NAME } },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Review this pull request diff:\n\n${formattedChunk}${extraUserSuffix}`,
          },
        ],
      });

      const message = response.choices[0]?.message;
      const toolCall = message?.tool_calls?.[0];
      if (!toolCall || toolCall.type !== 'function') {
        const content = message?.content ?? '';
        if (looksLikeEmptyIntentInline(content)) {
          logger.info('Recovered empty findings from non-tool content', {
            repo: parsedDiff.repo,
            prNumber: parsedDiff.prNumber,
          });
          return { issues: [] as DetectedIssue[], tokensUsed: response.usage?.total_tokens ?? 0 };
        }
        throw new Error('Groq did not return a tool call response');
      }

      let parsedResponse: unknown;
      try {
        parsedResponse = JSON.parse(toolCall.function.arguments);
      } catch {
        if (looksLikeEmptyIntentInline(toolCall.function.arguments)) {
          return { issues: [] as DetectedIssue[], tokensUsed: response.usage?.total_tokens ?? 0 };
        }
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
        .map(mapRawIssue)
        .filter((issue): issue is DetectedIssue => issue !== null);

      return {
        issues,
        tokensUsed: response.usage?.total_tokens ?? 0,
      };
    };

    try {
      return await attemptOnce('');
    } catch (error) {
      if (isRateLimitError(error)) throw error;

      if (canRecoverEmptyIssuesFromError(error)) {
        logger.info('Recovered empty findings from malformed Groq tool response', {
          repo: parsedDiff.repo,
          prNumber: parsedDiff.prNumber,
        });
        return { issues: [], tokensUsed: 0 };
      }

      // One stricter re-prompt for format failures only.
      const msg = errorMessage(error);
      const formatFail =
        msg.includes('tool_use_failed') ||
        msg.includes('output_parse_failed') ||
        msg.includes('did not return a tool call') ||
        msg.includes('Failed to parse Groq tool call') ||
        msg.includes('Tool choice is required');
      if (!formatFail) throw error;

      try {
        logger.warn('Retrying chunk analysis with stricter tool-call instruction', {
          repo: parsedDiff.repo,
          prNumber: parsedDiff.prNumber,
        });
        return await attemptOnce(stricterSuffix);
      } catch (retryError) {
        if (isRateLimitError(retryError)) throw retryError;
        if (canRecoverEmptyIssuesFromError(retryError)) {
          logger.info('Recovered empty findings after stricter retry', {
            repo: parsedDiff.repo,
            prNumber: parsedDiff.prNumber,
          });
          return { issues: [], tokensUsed: 0 };
        }
        throw retryError;
      }
    }
  }

  async analyzeDiff(
    parsedDiff: ParsedDiff,
    tracer?: PipelineTracer,
    options?: {
      model?: string;
      /** Eval-only override; production leaves this unset (uses GROQ_MAX_COMPLETION_TOKENS). */
      maxCompletionTokens?: number;
      /** Eval: throw immediately on 429 instead of long backoff. */
      abortOnRateLimit?: boolean;
    },
  ): Promise<AnalysisResult> {
    const model = options?.model?.trim() || GROQ_MODEL;
    const run = <T>(
      step: string,
      fn: () => Promise<T>,
      metadata?: Record<string, unknown>,
    ): Promise<T> => (tracer ? tracer.run(step, fn, metadata) : fn());

    try {
      const reviewableFiles = getReviewableFiles(parsedDiff);

      if (reviewableFiles.length === 0) {
        logger.info('No reviewable lines in diff, skipping analysis', {
          repo: parsedDiff.repo,
          prNumber: parsedDiff.prNumber,
        });
        return { ...buildEmptyResult(parsedDiff), modelUsed: model };
      }

      const prioritizedFilenames = await run('triage', () =>
        this.triageFiles({
          prTitle: parsedDiff.prTitle,
          prDescription: parsedDiff.prDescription,
          files: reviewableFiles.map((f) => ({
            filename: f.filename,
            additions: f.additions,
            deletions: f.deletions,
            status: f.status,
          })),
          model,
        }),
      );

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
        return { ...buildEmptyResult(parsedDiff), modelUsed: model };
      }

      const chunks =
        formattedDiff.length > MAX_DIFF_CHUNK_CHAR_LIMIT
          ? splitFormattedDiffIntoChunks(formattedDiff, MAX_DIFF_CHUNK_CHAR_LIMIT)
          : [formattedDiff];

      const allIssues: DetectedIssue[] = [];
      let tokensUsed = 0;
      let chunksFailed = 0;
      let rateLimited = false;

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        try {
          const { issues, tokensUsed: chunkTokens } = await run(
            `chunk_${chunkIndex}_analysis`,
            () =>
              this.analyzeChunk(chunks[chunkIndex], parsedDiff, model, {
                maxCompletionTokens: options?.maxCompletionTokens,
                abortOnRateLimit: options?.abortOnRateLimit,
              }),
            { chunkIndex, totalChunks: chunks.length },
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
          chunksFailed += 1;
          if (isRateLimitError(chunkError)) {
            rateLimited = true;
            if (options?.abortOnRateLimit) {
              return {
                prNumber: parsedDiff.prNumber,
                repo: parsedDiff.repo,
                headSha: parsedDiff.headSha,
                issues: [],
                filesAnalyzed: filesToReview.length,
                analyzedAt: new Date().toISOString(),
                modelUsed: model,
                tokensUsed,
                chunksAttempted: chunks.length,
                chunksFailed,
                analysisIncomplete: true,
                rateLimited: true,
              };
            }
          }
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
      const analysisIncomplete = chunksFailed > 0;

      logger.info('Final merged results', {
        totalIssues: allIssues.length,
        afterDedup: deduped.length,
        chunksAttempted: chunks.length,
        chunksFailed,
        analysisIncomplete,
        rateLimited,
        repo: parsedDiff.repo,
        prNumber: parsedDiff.prNumber,
      });

      logger.info('Groq analysis complete', {
        repo: parsedDiff.repo,
        prNumber: parsedDiff.prNumber,
        issueCount: cappedIssues.length,
        tokensUsed,
        model,
        chunksAnalyzed: chunks.length,
        chunksFailed,
        analysisIncomplete,
        rateLimited,
      });

      return {
        prNumber: parsedDiff.prNumber,
        repo: parsedDiff.repo,
        headSha: parsedDiff.headSha,
        issues: cappedIssues,
        filesAnalyzed: filesToReview.length,
        analyzedAt: new Date().toISOString(),
        modelUsed: model,
        tokensUsed,
        chunksAttempted: chunks.length,
        chunksFailed,
        analysisIncomplete,
        rateLimited,
      };
    } catch (error) {
      logger.error('Groq analysis failed', {
        repo: parsedDiff.repo,
        prNumber: parsedDiff.prNumber,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return {
        ...buildEmptyResult(parsedDiff, {
          analysisIncomplete: true,
          chunksAttempted: 0,
          chunksFailed: 1,
        }),
        modelUsed: model,
      };
    }
  }
}

export const groqAnalysisService = new GroqAnalysisService();
