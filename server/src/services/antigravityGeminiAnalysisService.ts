/** PR diff analysis via Google Gemini Interactions API (Antigravity-style workspace + SSE traces). */

import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import {
  CODE_REVIEW_ISSUES_TOOL_NAME,
  GEMINI_ANTIGRAVITY_MODEL,
  GEMINI_MAX_OUTPUT_TOKENS,
  MAX_DIFF_CHUNK_CHAR_LIMIT,
  MAX_ISSUES_PER_PR,
  TRIAGE_MAX_COMPLETION_TOKENS,
  TRIAGE_MAX_FILES,
} from '../config/constants';
import { env } from '../config/env';
import type { AnalyzeDiffWorkspaceContext } from '../types/agentWorkspace';
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
import { loadAgentsMd } from '../utils/loadAgentsMd';
import { AntigravityWorkspaceSession } from './antigravityWorkspaceSession';
import { appendGeminiSseToSession } from './geminiInteractionsSseTrace';
import { databaseService } from './databaseService';

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

const TRIAGE_JSON_SCHEMA = {
  type: 'array',
  items: { type: 'string' },
} as const;

const ISSUES_JSON_SCHEMA = {
  type: 'object',
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Exact filename as shown in the diff' },
          line: { type: 'number', description: 'Line number in the new file' },
          category: { type: 'string' },
          severity: { type: 'string' },
          title: { type: 'string' },
          explanation: { type: 'string' },
          suggestion: { type: 'string' },
          codeSnippet: { type: 'string' },
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
} as const;

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
- Do not invent issues that aren't clearly present in the code
- Respond ONLY with JSON matching the configured schema (object with "issues" array).`;

const TRIAGE_SYSTEM_PROMPT =
  'You are a code review triage assistant. Return only a JSON array of filenames (strings), matching the schema. Nothing else.';

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
  const title = raw.title.length > 60 ? `${raw.title.slice(0, 57)}...` : raw.title;

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
  return [...issues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

function buildEmptyResult(parsedDiff: ParsedDiff): AnalysisResult {
  return {
    prNumber: parsedDiff.prNumber,
    repo: parsedDiff.repo,
    headSha: parsedDiff.headSha,
    issues: [],
    filesAnalyzed: 0,
    analyzedAt: new Date().toISOString(),
    modelUsed: GEMINI_ANTIGRAVITY_MODEL,
    tokensUsed: 0,
  };
}

function buildTriagePrompt(params: {
  prTitle: string;
  prDescription: string;
  files: TriageFileInput[];
}): string {
  const description = params.prDescription.trim() || '(none)';
  const fileLines = params.files.map((f) => `- ${f.filename} (+${f.additions} -${f.deletions})`).join('\n');

  return `PR Title: ${params.prTitle}
PR Description: ${description}

Changed files:
${fileLines}

Return a JSON array of filenames ranked by review priority.
Focus on files most likely to contain bugs, security issues, or logic errors.
Skip generated files, lock files, style files, test files.
Return maximum ${TRIAGE_MAX_FILES} filenames.`;
}

function parseTriageFilenames(content: string): string[] | null {
  const trimmed = content.trim();

  const tryParse = (text: string): string[] | null => {
    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string')) {
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

function fallbackTriageFilenames(files: TriageFileInput[]): string[] {
  return [...files]
    .sort((a, b) => b.additions - a.additions)
    .slice(0, TRIAGE_MAX_FILES)
    .map((f) => f.filename);
}

function selectFilesForReview(reviewableFiles: ParsedFile[], prioritizedFilenames: string[]): ParsedFile[] {
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

const HABIT_CONTEXT_ISSUE_LIMIT = 40;
const HABIT_PROMPT_MAX_CHARS = 6000;

type HabitIssueRow = {
  file: string;
  line: number;
  category: string;
  severity: string;
  title: string;
  createdAt: Date;
};

function buildHabitPromptSuffix(rows: HabitIssueRow[]): string {
  if (rows.length === 0) {
    return '';
  }
  const lines = rows.map(
    (r) =>
      `- [${r.severity}/${r.category}] ${r.file}:${r.line} — ${r.title} (${r.createdAt.toISOString()})`,
  );
  let block = lines.join('\n');
  if (block.length > HABIT_PROMPT_MAX_CHARS) {
    block = `${block.slice(0, HABIT_PROMPT_MAX_CHARS)}\n…(truncated)`;
  }
  return `\n\nDEVELOPER HISTORY (prior merged CodePulse findings for this author in this organization — use only to spot recurring anti-patterns; only flag issues clearly evidenced in the current diff):\n${block}`;
}

const CREDENTIAL_PATTERNS: RegExp[] = [
  /ghp_[a-zA-Z0-9]{36}/,
  /github_pat_[a-zA-Z0-9_]+/,
  /sk-[a-zA-Z0-9]{10,}/i,
  /AKIA[0-9A-Z]{16}/,
  /BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/,
  /xox[baprs]-[0-9a-z-]+/i,
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
];

function issueLooksLikeCredentialLeak(issue: DetectedIssue): boolean {
  const blob = `${issue.codeSnippet}\n${issue.explanation}\n${issue.title}`;
  return CREDENTIAL_PATTERNS.some((re) => re.test(blob));
}

function orchestratorEscalateCredentialLeaks(issues: DetectedIssue[]): DetectedIssue[] {
  return issues.map((issue) => {
    if (!issueLooksLikeCredentialLeak(issue)) {
      return issue;
    }
    if (issue.severity === 'critical' && issue.category === 'security') {
      return issue;
    }
    return {
      ...issue,
      severity: 'critical',
      category: 'security',
    };
  });
}

function interactionOutputText(interaction: {
  output_text?: string;
  steps?: unknown[];
}): string {
  if (interaction.output_text?.trim()) {
    return interaction.output_text.trim();
  }
  const steps = interaction.steps ?? [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i] as { type?: string; content?: { type?: string; text?: string }[] };
    if (s.type === 'model_output' && Array.isArray(s.content)) {
      const texts = s.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join('');
      if (texts.trim()) {
        return texts.trim();
      }
    }
  }
  return '';
}

function usageTokens(interaction: { usage?: Record<string, unknown> } | undefined): number {
  const u = interaction?.usage;
  if (!u) {
    return 0;
  }
  const t = u.total_tokens ?? u.totalTokenCount ?? u.prompt_token_count;
  return typeof t === 'number' ? t : 0;
}

export class AntigravityGeminiAnalysisService {
  private readonly ai: GoogleGenAI;

  private readonly agentsMd: string;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    this.agentsMd = loadAgentsMd();
  }

  private personaSystemBlock(): string {
    const body =
      this.agentsMd.length > 0
        ? this.agentsMd
        : '(AGENTS.md not found on disk — using default Antigravity persona names only.)';
    return `## CodePulse Antigravity workspace personas (from .agent/AGENTS.md)

${body}

Operational roles:
- @Triager: prioritize changed paths and ignore generated noise.
- @HabitAnalyzer: use developer history context when provided in the user message.
- @ReviewerSwarm: produce the JSON tool/schema output for findings from the diff.
- @Orchestrator: downstream policy is enforced server-side (CRITICAL handling, dedupe, caps).`;
  }

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
      const interaction = await this.ai.interactions.create({
        model: GEMINI_ANTIGRAVITY_MODEL,
        input: prompt,
        system_instruction: `${this.personaSystemBlock()}\n\n${TRIAGE_SYSTEM_PROMPT}`,
        stream: false,
        store: false,
        generation_config: {
          max_output_tokens: TRIAGE_MAX_COMPLETION_TOKENS,
          temperature: 0.2,
        },
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: TRIAGE_JSON_SCHEMA as unknown as Record<string, unknown>,
        },
      });

      const content = interactionOutputText(interaction);
      if (!content) {
        throw new Error('Triage interaction had no text output');
      }

      const parsed = parseTriageFilenames(content);
      if (!parsed || parsed.length === 0) {
        throw new Error('Triage response was not a valid JSON filename array');
      }

      const knownFilenames = new Set(params.files.map((f) => f.filename));
      const selected = parsed.filter((name) => knownFilenames.has(name)).slice(0, TRIAGE_MAX_FILES);

      if (selected.length === 0) {
        throw new Error('Triage returned no known filenames');
      }

      logger.info('Gemini triage complete', {
        totalFiles: params.files.length,
        selectedFiles: selected.length,
        prTitle: params.prTitle,
      });

      return selected;
    } catch (error) {
      logger.warn('Gemini triage failed, falling back to additions sort', {
        prTitle: params.prTitle,
        error: error instanceof Error ? error.message : String(error),
      });

      return fallbackTriageFilenames(params.files);
    }
  }

  private async analyzeChunkStreaming(
    formattedChunk: string,
    parsedDiff: ParsedDiff,
    habitPromptSuffix: string,
    session: AntigravityWorkspaceSession,
  ): Promise<{ issues: DetectedIssue[]; tokensUsed: number }> {
    const stream = await this.ai.interactions.create({
      model: GEMINI_ANTIGRAVITY_MODEL,
      input: `Review this pull request diff. Tool name for reference: ${CODE_REVIEW_ISSUES_TOOL_NAME}.\n\n${formattedChunk}`,
      system_instruction: `${this.personaSystemBlock()}\n\n${SYSTEM_PROMPT}${habitPromptSuffix}`,
      stream: true,
      store: false,
      generation_config: {
        max_output_tokens: GEMINI_MAX_OUTPUT_TOKENS,
        temperature: 0.2,
        thinking_summaries: 'auto',
      },
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: ISSUES_JSON_SCHEMA as unknown as Record<string, unknown>,
      },
    });

    let completed: { usage?: Record<string, unknown>; output_text?: string; steps?: unknown[] } | null = null;
    let streamedText = '';

    for await (const event of stream) {
      await appendGeminiSseToSession(session, event);
      const e = event as {
        event_type?: string;
        interaction?: typeof completed;
        delta?: { type?: string; text?: string };
      };
      if (e.event_type === 'step.delta' && e.delta?.type === 'text' && e.delta.text) {
        streamedText += e.delta.text;
      }
      if (e.event_type === 'interaction.completed' && e.interaction) {
        completed = e.interaction;
      }
    }

    const fromInteraction = completed ? interactionOutputText(completed) : '';
    const text = fromInteraction || streamedText.trim();
    if (!text) {
      throw new Error('Gemini streaming interaction completed without JSON text');
    }

    let parsedResponse: unknown;
    try {
      parsedResponse = JSON.parse(text);
    } catch {
      logger.error('Failed to parse Gemini JSON output', {
        preview: text.slice(0, 400),
        repo: parsedDiff.repo,
        prNumber: parsedDiff.prNumber,
      });
      throw new Error('Failed to parse Gemini JSON output');
    }

    const validated = toolResponseSchema.safeParse(parsedResponse);
    if (!validated.success) {
      logger.error('Gemini JSON failed validation', {
        issues: validated.error.issues,
        repo: parsedDiff.repo,
        prNumber: parsedDiff.prNumber,
      });
      throw new Error('Failed to parse Gemini tool response');
    }

    const issues = validated.data.issues
      .map((raw) => mapRawIssue(raw))
      .filter((issue): issue is DetectedIssue => issue !== null);

    return {
      issues,
      tokensUsed: usageTokens(completed ?? undefined),
    };
  }

  async analyzeDiff(
    parsedDiff: ParsedDiff,
    workspaceCtx?: AnalyzeDiffWorkspaceContext,
  ): Promise<AnalysisResult> {
    const session = new AntigravityWorkspaceSession(workspaceCtx);
    await session.open();

    try {
      await session.transition(
        'workspace',
        '@Triager',
        'Antigravity workspace delegating to @Triager (Gemini Interactions API, gemini-3.5-flash).',
        { repo: parsedDiff.repo, prNumber: parsedDiff.prNumber, model: GEMINI_ANTIGRAVITY_MODEL },
      );

      const reviewableFiles = getReviewableFiles(parsedDiff);
      await session.thought(
        '@Triager',
        `Applied getReviewableFiles: ${reviewableFiles.length} reviewable file(s) from ${parsedDiff.files.length} changed.`,
        { reviewableCount: reviewableFiles.length, totalFiles: parsedDiff.files.length },
      );

      if (reviewableFiles.length === 0) {
        await session.step(
          '@Triager',
          'No reviewable lines in diff; skipping Gemini triage and downstream agents.',
          {},
        );
        const empty = buildEmptyResult(parsedDiff);
        await session.close('Workspace session complete (no reviewable diff).', {
          outcome: 'empty_reviewable',
        });
        logger.info('No reviewable lines in diff, skipping analysis', {
          repo: parsedDiff.repo,
          prNumber: parsedDiff.prNumber,
        });
        return empty;
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

      await session.step(
        '@Triager',
        `Triage loop complete: ${prioritizedFilenames.length} filename(s) prioritized for deep review (cap ${TRIAGE_MAX_FILES}).`,
        { prioritizedFilenames: prioritizedFilenames.slice(0, 40) },
      );

      const filesToReview = selectFilesForReview(reviewableFiles, prioritizedFilenames);
      const reviewableLines = countReviewableLines(filesToReview);
      const formattedDiff = formatDiffForPrompt(parsedDiff, filesToReview);

      await session.thought(
        '@Triager',
        `diffFormatter selected ${filesToReview.length} file(s), ${reviewableLines} reviewable line(s), formatted diff ${formattedDiff.length} chars.`,
        {
          filesToReview: filesToReview.length,
          reviewableLines,
          formattedLength: formattedDiff.length,
        },
      );

      if (reviewableLines === 0 || formattedDiff.length === 0) {
        await session.step(
          '@Triager',
          'Prioritized set has no reviewable lines or empty formatted diff; stopping before habit and reviewer swarm.',
          { reviewableLines, formattedLength: formattedDiff.length },
        );
        const empty = buildEmptyResult(parsedDiff);
        await session.close('Workspace session complete (empty prioritized diff).', {
          outcome: 'empty_prioritized',
        });
        logger.info('No reviewable lines in prioritized files, skipping analysis', {
          repo: parsedDiff.repo,
          prNumber: parsedDiff.prNumber,
          reviewableLines,
        });
        return empty;
      }

      await session.transition(
        '@Triager',
        '@HabitAnalyzer',
        'Handoff to @HabitAnalyzer for developer habit context via database lookup.',
        {},
      );

      let habitPromptSuffix = '';
      if (workspaceCtx) {
        const pastRows = await databaseService.findRecentIssuesForDeveloperHabitContext({
          developerId: workspaceCtx.developerId,
          organizationId: workspaceCtx.organizationId,
          excludePullRequestId: workspaceCtx.pullRequestId,
          limit: HABIT_CONTEXT_ISSUE_LIMIT,
        });
        await session.tool(
          '@HabitAnalyzer',
          'databaseService.findRecentIssuesForDeveloperHabitContext',
          {
            rowCount: pastRows.length,
            developerId: workspaceCtx.developerId,
            organizationId: workspaceCtx.organizationId,
          },
        );
        habitPromptSuffix = buildHabitPromptSuffix(pastRows);
        await session.thought(
          '@HabitAnalyzer',
          pastRows.length > 0
            ? `Loaded ${pastRows.length} prior issue row(s); habit block length ${habitPromptSuffix.length} chars.`
            : 'No prior issues for this developer in this org (excluding current PR).',
          { habitBlockChars: habitPromptSuffix.length },
        );
      } else {
        await session.step(
          '@HabitAnalyzer',
          'No AnalyzeDiffWorkspaceContext; skipping Prisma habit lookup (trace persistence also disabled).',
          {},
        );
      }

      const chunks =
        formattedDiff.length > MAX_DIFF_CHUNK_CHAR_LIMIT
          ? splitFormattedDiffIntoChunks(formattedDiff, MAX_DIFF_CHUNK_CHAR_LIMIT)
          : [formattedDiff];

      await session.transition(
        '@HabitAnalyzer',
        '@ReviewerSwarm',
        `Handoff to @ReviewerSwarm for Gemini Interactions streaming review (${GEMINI_ANTIGRAVITY_MODEL}).`,
        { chunkCount: chunks.length, model: GEMINI_ANTIGRAVITY_MODEL },
      );

      logger.info('Antigravity reviewer swarm started (Gemini)', {
        totalFiles: parsedDiff.files.length,
        prioritizedFiles: prioritizedFilenames.length,
        chunks: chunks.length,
        repo: parsedDiff.repo,
        prNumber: parsedDiff.prNumber,
      });

      const allIssues: DetectedIssue[] = [];
      let tokensUsed = 0;

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        try {
          await session.thought(
            '@ReviewerSwarm',
            `Gemini Interactions stream: chunk ${chunkIndex + 1}/${chunks.length} (chars=${chunks[chunkIndex].length}).`,
            { chunkIndex, totalChunks: chunks.length },
          );

          const { issues, tokensUsed: chunkTokens } = await this.analyzeChunkStreaming(
            chunks[chunkIndex],
            parsedDiff,
            habitPromptSuffix,
            session,
          );
          tokensUsed += chunkTokens;
          allIssues.push(...issues);

          await session.step(
            '@ReviewerSwarm',
            `Chunk ${chunkIndex + 1}/${chunks.length} returned ${issues.length} issue(s); tokens +${chunkTokens}.`,
            { chunkIndex, issuesInChunk: issues.length, chunkTokens },
          );

          logger.info('Chunk analysis (Gemini)', {
            chunkIndex,
            totalChunks: chunks.length,
            issuesInChunk: issues.length,
            repo: parsedDiff.repo,
            prNumber: parsedDiff.prNumber,
          });
        } catch (chunkError) {
          await session.step(
            '@ReviewerSwarm',
            `Chunk ${chunkIndex + 1} failed: ${chunkError instanceof Error ? chunkError.message : String(chunkError)}`,
            { chunkIndex, totalChunks: chunks.length },
          );
          logger.error('Chunk analysis failed (Gemini)', {
            chunkIndex,
            totalChunks: chunks.length,
            repo: parsedDiff.repo,
            prNumber: parsedDiff.prNumber,
            error: chunkError instanceof Error ? chunkError.message : String(chunkError),
          });
        }
      }

      await session.transition(
        '@ReviewerSwarm',
        '@Orchestrator',
        'Handoff to @Orchestrator for dedupe, severity ordering, CRITICAL / credential-leak policy, and cap.',
        { rawIssueCount: allIssues.length },
      );

      const deduped = dedupeIssues(allIssues);
      const afterCredentialPass = orchestratorEscalateCredentialLeaks(deduped);
      const criticalIssues = afterCredentialPass.filter((i) => i.severity === 'critical');
      const cappedIssues = sortBySeverity(afterCredentialPass).slice(0, MAX_ISSUES_PER_PR);

      await session.thought(
        '@Orchestrator',
        `Merged pipeline: raw=${allIssues.length}, after dedupe=${deduped.length}, after credential scan=${afterCredentialPass.length}, CRITICAL count=${criticalIssues.length}, after cap=${cappedIssues.length}.`,
        {
          raw: allIssues.length,
          deduped: deduped.length,
          postCredential: afterCredentialPass.length,
          criticalCount: criticalIssues.length,
          capped: cappedIssues.length,
        },
      );

      await session.step(
        '@Orchestrator',
        criticalIssues.length > 0
          ? `CRITICAL scan: ${criticalIssues.length} issue(s) at critical severity (includes credential-pattern escalations). Resend escalation will run for enabled repos.`
          : 'CRITICAL scan: no critical-severity issues after merge and credential-pattern pass.',
        {
          criticalCount: criticalIssues.length,
          criticalTitles: criticalIssues.slice(0, 12).map((i) => i.title),
        },
      );

      logger.info('Final merged results (Gemini)', {
        totalIssues: allIssues.length,
        afterDedup: deduped.length,
        repo: parsedDiff.repo,
        prNumber: parsedDiff.prNumber,
      });

      logger.info('Gemini analysis complete', {
        repo: parsedDiff.repo,
        prNumber: parsedDiff.prNumber,
        issueCount: cappedIssues.length,
        tokensUsed,
        model: GEMINI_ANTIGRAVITY_MODEL,
        chunksAnalyzed: chunks.length,
      });

      const result: AnalysisResult = {
        prNumber: parsedDiff.prNumber,
        repo: parsedDiff.repo,
        headSha: parsedDiff.headSha,
        issues: cappedIssues,
        filesAnalyzed: filesToReview.length,
        analyzedAt: new Date().toISOString(),
        modelUsed: GEMINI_ANTIGRAVITY_MODEL,
        tokensUsed,
      };

      await session.close('Antigravity workspace session complete (Gemini Interactions).', {
        outcome: 'success',
        issueCount: cappedIssues.length,
      });

      return result;
    } catch (error) {
      await session.close('Antigravity workspace session aborted due to error.', {
        outcome: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
      logger.error('Gemini analysis failed', {
        repo: parsedDiff.repo,
        prNumber: parsedDiff.prNumber,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return buildEmptyResult(parsedDiff);
    }
  }
}

export const antigravityGeminiAnalysisService = new AntigravityGeminiAnalysisService();
