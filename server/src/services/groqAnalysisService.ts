/** Groq-powered AI code review: analyzes parsed diffs and returns structured issues. */

import crypto from 'crypto';
import Groq from 'groq-sdk';
import { z } from 'zod';
import {
  GROQ_MAX_COMPLETION_TOKENS,
  GROQ_MODEL,
  GROQ_TOOL_NAME,
  MAX_ISSUES_PER_PR,
} from '../config/constants';
import { env } from '../config/env';
import type {
  AnalysisResult,
  DetectedIssue,
  IssueCategory,
  IssueSeverity,
} from '../types/analysis';
import type { ParsedDiff } from '../types/diff';
import { countReviewableLines, formatDiffForPrompt } from '../utils/diffFormatter';
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

export class GroqAnalysisService {
  private readonly groq: Groq;

  constructor() {
    this.groq = new Groq({ apiKey: env.GROQ_API_KEY });
  }

  async analyzeDiff(parsedDiff: ParsedDiff): Promise<AnalysisResult> {
    try {
      const formattedDiff = formatDiffForPrompt(parsedDiff);
      const reviewableLines = countReviewableLines(parsedDiff);

      if (reviewableLines === 0 || formattedDiff.length === 0) {
        logger.info('No reviewable lines in diff, skipping analysis', {
          repo: parsedDiff.repo,
          prNumber: parsedDiff.prNumber,
          reviewableLines,
        });
        return buildEmptyResult(parsedDiff);
      }

      logger.info('Sending diff to Groq for analysis', {
        repo: parsedDiff.repo,
        prNumber: parsedDiff.prNumber,
        reviewableLines,
      });

      const response = await this.groq.chat.completions.create({
        model: GROQ_MODEL,
        max_tokens: GROQ_MAX_COMPLETION_TOKENS,
        tools: [codeReviewTool],
        tool_choice: { type: 'function', function: { name: GROQ_TOOL_NAME } },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Review this pull request diff:\n\n${formattedDiff}`,
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

      const cappedIssues = sortBySeverity(issues).slice(0, MAX_ISSUES_PER_PR);
      const tokensUsed = response.usage?.total_tokens ?? 0;

      logger.info('Groq analysis complete', {
        repo: parsedDiff.repo,
        prNumber: parsedDiff.prNumber,
        issueCount: cappedIssues.length,
        tokensUsed,
        model: GROQ_MODEL,
      });

      return {
        prNumber: parsedDiff.prNumber,
        repo: parsedDiff.repo,
        headSha: parsedDiff.headSha,
        issues: cappedIssues,
        filesAnalyzed: parsedDiff.files.filter((f) => f.additions > 0).length,
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
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Groq analysis failed: ${message}`);
    }
  }
}

export const groqAnalysisService = new GroqAnalysisService();
