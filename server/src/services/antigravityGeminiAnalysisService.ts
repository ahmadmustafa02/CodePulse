/** PR diff analysis via Google Gemini Interactions API (Antigravity-style workspace + SSE traces). */

import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import type { Interactions } from '@google/genai';
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
  EscalationRecord,
  IssueCategory,
  IssueSeverity,
} from '../types/analysis';
import type { ParsedDiff, ParsedFile, ParsedFileStatus } from '../types/diff';
import { ANTIGRAVITY_ENV, withAntigravityMeta } from '../utils/antigravityMeta';
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

const AGENT_ROLES = {
  orchestrator: '@Orchestrator',
  triager: '@Triager',
  reviewer: '@ReviewerSwarm',
  habitAnalyzer: '@HabitAnalyzer',
} as const;

/** ParsedFile has no triage risk field; approximate "high-risk" files via churn + sensitive path hints. */
function isHighRiskFileForOrchestrator(f: ParsedFile): boolean {
  const churn = f.additions + f.deletions;
  if (churn >= 120) {
    return true;
  }
  return /(?:secret|credential|password|token|auth|crypto|payment|sql|migrate|vault|\.env)/i.test(f.filename);
}

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

type GenaiTool = Interactions.Tool;
type FunctionResultStep = Interactions.FunctionResultStep;

const CODEPULSE_TOOLS: GenaiTool[] = [
  {
    type: 'function',
    name: 'triage_files',
    description:
      'Rank the files in this pull request by review priority. Returns prioritized filenames and risk indicators. Call this FIRST to decide which files deserve deep review.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Why you decided to triage now.' },
      },
      required: ['reason'],
    },
  },
  {
    type: 'function',
    name: 'lookup_developer_habits',
    description:
      'Query the developer history database for recurring issue patterns by this PR author. Use this when you want context on what mistakes this developer tends to repeat, so your review can focus on their weak spots.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Why habit context will improve this review.' },
      },
      required: ['reason'],
    },
  },
  {
    type: 'function',
    name: 'analyze_chunk',
    description:
      'Perform deep semantic analysis on a specific chunk of the diff. Returns a list of structured findings (issues) with severity, line numbers, category, and suggested fixes. Call this for each chunk you want reviewed. You decide chunk-by-chunk what to focus on.',
    parameters: {
      type: 'object',
      properties: {
        chunk_index: { type: 'integer', description: 'Zero-based index of the chunk to analyze.' },
        focus: {
          type: 'string',
          enum: ['security', 'logic', 'performance', 'style', 'general'],
          description: 'What to focus on in this chunk based on what triage and habits told you.',
        },
      },
      required: ['chunk_index', 'focus'],
    },
  },
  {
    type: 'function',
    name: 'escalate_critical_finding',
    description:
      'Escalate a CRITICAL-severity finding (credential leak, SQLi, auth bypass) to the team lead. This creates an escalation record and a simulated alert. Only call this for genuinely critical issues, not for medium/low findings.',
    parameters: {
      type: 'object',
      properties: {
        file: { type: 'string' },
        line: { type: 'integer' },
        category: { type: 'string' },
        summary: { type: 'string', description: 'One-sentence description of the critical issue.' },
        justification: { type: 'string', description: 'Why this rises to escalation level.' },
      },
      required: ['file', 'line', 'category', 'summary', 'justification'],
    },
  },
  { type: 'google_search' },
];

const ORCHESTRATOR_SYSTEM_PROMPT = `You are the CodePulse Antigravity orchestrator agent. You run in the Google Antigravity environment (environment id: antigravity).

You have tools: triage_files, lookup_developer_habits, analyze_chunk, escalate_critical_finding, and google_search (platform-executed search). You must decide which tools to call and in what order—TypeScript does not hardcode that sequence.

Recommended flow:
1) Call triage_files first unless the change set is trivially small (e.g. a single tiny file with very few lines); do not skip triage for substantial PRs.
2) Optionally call lookup_developer_habits when workspace context exists and habits would sharpen the review.
3) Call analyze_chunk for each diff chunk that deserves review (you choose indices and a focus area per chunk).
4) Call escalate_critical_finding only for genuinely critical issues (credential leaks, severe auth/SQLi, etc.) as they are confirmed.
5) You may rely on google_search for CVE or unfamiliar API verification when useful (the platform executes it; you will not see a local handler for it).

When all tool work is finished, end your turn with a brief plain-text summary of what you did and the main outcomes. Do not dump the full diff in user-visible text; chunk content is only accessed via analyze_chunk.`;

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

type AgentToolExecutionContext = {
  parsedDiff: ParsedDiff;
  workspaceCtx?: AnalyzeDiffWorkspaceContext;
  session: AntigravityWorkspaceSession;
  chunks: string[];
  habitContextHolder: { value: string | null };
  accumulatedIssues: DetectedIssue[];
  escalations: EscalationRecord[];
  reviewableFiles: ParsedFile[];
  filesToReview: ParsedFile[];
  tokensAccumulator: { value: number };
};

type PendingOrchestratorToolCall = {
  call_id: string;
  name: string;
  args_buffer: string;
};

function rebuildChunksForFiles(ctx: AgentToolExecutionContext): void {
  const lines = countReviewableLines(ctx.filesToReview);
  const formatted = formatDiffForPrompt(ctx.parsedDiff, ctx.filesToReview);
  ctx.chunks =
    formatted.length > MAX_DIFF_CHUNK_CHAR_LIMIT
      ? splitFormattedDiffIntoChunks(formatted, MAX_DIFF_CHUNK_CHAR_LIMIT)
      : lines > 0 && formatted.length > 0
        ? [formatted]
        : [];
}

function countSeverityBuckets(issues: DetectedIssue[]): Record<string, number> {
  const out: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const i of issues) {
    out[i.severity] = (out[i.severity] ?? 0) + 1;
  }
  return out;
}

function usageTokens(interaction: { usage?: unknown } | undefined): number {
  const u = interaction?.usage as Record<string, unknown> | undefined;
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
  }): Promise<{ filenames: string[]; triageInteractionId?: string }> {
    if (params.files.length === 0) {
      return { filenames: [] };
    }

    if (params.files.length <= TRIAGE_MAX_FILES) {
      return { filenames: params.files.map((f) => f.filename) };
    }

    const prompt = buildTriagePrompt(params);

    try {
      const interaction = await this.ai.interactions.create({
        model: GEMINI_ANTIGRAVITY_MODEL,
        input: prompt,
        system_instruction: `${this.personaSystemBlock()}\n\n${TRIAGE_SYSTEM_PROMPT}`,
        stream: false,
        store: true,
        environment: ANTIGRAVITY_ENV,
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

      const triageInteractionId = interaction.id;

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
        triageInteractionId,
      });

      return { filenames: selected, triageInteractionId };
    } catch (error) {
      logger.warn('Gemini triage failed, falling back to additions sort', {
        prTitle: params.prTitle,
        error: error instanceof Error ? error.message : String(error),
      });

      return { filenames: fallbackTriageFilenames(params.files) };
    }
  }

  private async analyzeChunkAsTool(
    chunkText: string,
    focus: string,
    parsedDiff: ParsedDiff,
    habitPromptSuffix: string,
    _session: AntigravityWorkspaceSession,
  ): Promise<{ issues: DetectedIssue[]; tokensUsed: number }> {
    const focusBlock = `\n\nReview focus for this chunk: ${focus}.\n`;
    const interaction = await this.ai.interactions.create({
      model: GEMINI_ANTIGRAVITY_MODEL,
      input: `Review this pull request diff. Tool name for reference: ${CODE_REVIEW_ISSUES_TOOL_NAME}.\n\n${chunkText}`,
      system_instruction: `${this.personaSystemBlock()}\n\n${SYSTEM_PROMPT}${habitPromptSuffix}${focusBlock}`,
      stream: false,
      store: true,
      environment: ANTIGRAVITY_ENV,
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

    const text = interactionOutputText(interaction);
    if (!text) {
      throw new Error('Gemini chunk interaction had no JSON text');
    }

    let parsedResponse: unknown;
    try {
      parsedResponse = JSON.parse(text);
    } catch {
      logger.error('Failed to parse Gemini JSON output (chunk tool)', {
        preview: text.slice(0, 400),
        repo: parsedDiff.repo,
        prNumber: parsedDiff.prNumber,
      });
      throw new Error('Failed to parse Gemini JSON output');
    }

    const validated = toolResponseSchema.safeParse(parsedResponse);
    if (!validated.success) {
      logger.error('Gemini JSON failed validation (chunk tool)', {
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
      tokensUsed: usageTokens(interaction as { usage?: unknown }),
    };
  }

  private async analyzeChunkStreaming(
    formattedChunk: string,
    parsedDiff: ParsedDiff,
    habitPromptSuffix: string,
    _session: AntigravityWorkspaceSession,
    _previousInteractionId?: string,
  ): Promise<{ issues: DetectedIssue[]; tokensUsed: number; interactionId?: string }> {
    const { issues, tokensUsed } = await this.analyzeChunkAsTool(
      formattedChunk,
      'general',
      parsedDiff,
      habitPromptSuffix,
      _session,
    );
    return { issues, tokensUsed, interactionId: undefined };
  }

  private async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    ctx: AgentToolExecutionContext,
  ): Promise<unknown> {
    await ctx.session.thought(
      AGENT_ROLES.orchestrator,
      `Tool dispatch: ${toolName}`,
      withAntigravityMeta({ tool: toolName, args }),
    );

    switch (toolName) {
      case 'triage_files': {
        const outcome = await this.triageFiles({
          prTitle: ctx.parsedDiff.prTitle,
          prDescription: ctx.parsedDiff.prDescription,
          files: ctx.reviewableFiles.map((f) => ({
            filename: f.filename,
            additions: f.additions,
            deletions: f.deletions,
            status: f.status,
          })),
        });
        ctx.filesToReview = selectFilesForReview(ctx.reviewableFiles, outcome.filenames);
        rebuildChunksForFiles(ctx);
        const highRiskCount = ctx.filesToReview.filter((f) => {
          const ext = f as ParsedFile & { risk?: string; riskLevel?: string; priority?: string };
          const label = String(ext.risk ?? ext.riskLevel ?? ext.priority ?? '').toLowerCase();
          return label === 'high' || label === 'critical' || isHighRiskFileForOrchestrator(f);
        }).length;
        await ctx.session.step(
          AGENT_ROLES.orchestrator,
          `triage_files completed: ${outcome.filenames.length} filename(s), ${ctx.chunks.length} chunk(s) after format.`,
          withAntigravityMeta({
            tool: 'triage_files',
            filenames: outcome.filenames.slice(0, 40),
            highRiskCount,
            chunkCount: ctx.chunks.length,
          }),
        );
        return { filenames: outcome.filenames, highRiskCount };
      }
      case 'lookup_developer_habits': {
        if (!ctx.workspaceCtx) {
          await ctx.session.step(
            AGENT_ROLES.orchestrator,
            'lookup_developer_habits skipped: no workspace context.',
            withAntigravityMeta({ tool: 'lookup_developer_habits' }),
          );
          return { found: false, categories: [] as string[], summary: 'No workspace context for habit lookup.' };
        }
        const pastRows = await databaseService.findRecentIssuesForDeveloperHabitContext({
          developerId: ctx.workspaceCtx.developerId,
          organizationId: ctx.workspaceCtx.organizationId,
          excludePullRequestId: ctx.workspaceCtx.pullRequestId,
          limit: HABIT_CONTEXT_ISSUE_LIMIT,
        });
        const suffix = buildHabitPromptSuffix(pastRows);
        ctx.habitContextHolder.value = suffix.length > 0 ? suffix : null;
        const categories = [...new Set(pastRows.map((r) => r.category))];
        const summary =
          pastRows.length === 0
            ? 'No prior merged issues for this author in this org.'
            : `${pastRows.length} prior issue row(s); top categories: ${categories.slice(0, 8).join(', ')}.`;
        await ctx.session.step(
          AGENT_ROLES.orchestrator,
          `lookup_developer_habits: ${pastRows.length} row(s).`,
          withAntigravityMeta({ tool: 'lookup_developer_habits', rowCount: pastRows.length }),
        );
        return { found: pastRows.length > 0, categories, summary };
      }
      case 'analyze_chunk': {
        const chunkIndex = typeof args.chunk_index === 'number' ? args.chunk_index : Number(args.chunk_index);
        const focus = typeof args.focus === 'string' ? args.focus : 'general';
        if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= ctx.chunks.length) {
          throw new Error(`Invalid chunk_index ${String(args.chunk_index)} (have ${ctx.chunks.length} chunks)`);
        }
        const chunkText = ctx.chunks[chunkIndex];
        const habitSuffix = ctx.habitContextHolder.value ?? '';
        const { issues, tokensUsed } = await this.analyzeChunkAsTool(
          chunkText,
          focus,
          ctx.parsedDiff,
          habitSuffix,
          ctx.session,
        );
        ctx.tokensAccumulator.value += tokensUsed;
        ctx.accumulatedIssues.push(...issues);
        const bucket = countSeverityBuckets(issues);
        await ctx.session.step(
          AGENT_ROLES.orchestrator,
          `analyze_chunk[${chunkIndex}] focus=${focus}: ${issues.length} issue(s).`,
          withAntigravityMeta({ tool: 'analyze_chunk', chunkIndex, focus, issues_found: issues.length }),
        );
        return { issues_found: issues.length, severities: bucket };
      }
      case 'escalate_critical_finding': {
        const file = String(args.file ?? '');
        const line = typeof args.line === 'number' ? args.line : Number(args.line);
        const category = String(args.category ?? '');
        const summary = String(args.summary ?? '');
        const justification = String(args.justification ?? '');
        if (!file || !Number.isInteger(line) || line <= 0) {
          throw new Error('escalate_critical_finding requires valid file and line');
        }
        const id = `esc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const rec: EscalationRecord = {
          id,
          file,
          line,
          category,
          summary,
          justification,
          created_at: new Date().toISOString(),
          status: 'pending',
        };
        ctx.escalations.push(rec);
        rec.status = 'notified';
        await ctx.session.step(
          AGENT_ROLES.orchestrator,
          `Escalation recorded: ${summary}`,
          withAntigravityMeta({
            kind: 'escalation',
            escalation_id: id,
            file,
            line,
            category,
          }),
        );
        return { escalated: true, escalation_id: id };
      }
      case 'google_search': {
        logger.error('executeTool received google_search — unexpected; platform should handle server-side', {
          repo: ctx.parsedDiff.repo,
          prNumber: ctx.parsedDiff.prNumber,
        });
        await ctx.session.step(
          AGENT_ROLES.orchestrator,
          'google_search routed to local executeTool (unexpected).',
          withAntigravityMeta({ tool: 'google_search', error: true }),
        );
        return { error: 'google_search is executed by the platform, not CodePulse executeTool.' };
      }
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  async analyzeDiff(
    parsedDiff: ParsedDiff,
    workspaceCtx?: AnalyzeDiffWorkspaceContext,
  ): Promise<AnalysisResult> {
    const session = new AntigravityWorkspaceSession(workspaceCtx);
    await session.open();

    try {
      void this.analyzeChunkStreaming;

      const reviewableFiles = getReviewableFiles(parsedDiff);
      if (reviewableFiles.length === 0) {
        await session.step(
          '@Triager',
          'No reviewable lines in diff; skipping agent loop.',
          withAntigravityMeta({}),
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

      const filesToReview = [...reviewableFiles];
      const formattedDiff = formatDiffForPrompt(parsedDiff, filesToReview);
      const reviewableLines = countReviewableLines(filesToReview);
      if (reviewableLines === 0 || formattedDiff.length === 0) {
        await session.step(
          '@Triager',
          'No reviewable lines in formatted diff; skipping agent loop.',
          withAntigravityMeta({ reviewableLines, formattedLength: formattedDiff.length }),
        );
        const empty = buildEmptyResult(parsedDiff);
        await session.close('Workspace session complete (empty formatted diff).', {
          outcome: 'empty_prioritized',
        });
        logger.info('No reviewable lines in formatted diff, skipping analysis', {
          repo: parsedDiff.repo,
          prNumber: parsedDiff.prNumber,
        });
        return empty;
      }

      const chunks =
        formattedDiff.length > MAX_DIFF_CHUNK_CHAR_LIMIT
          ? splitFormattedDiffIntoChunks(formattedDiff, MAX_DIFF_CHUNK_CHAR_LIMIT)
          : [formattedDiff];

      const ctx: AgentToolExecutionContext = {
        parsedDiff,
        workspaceCtx,
        session,
        chunks,
        habitContextHolder: { value: null },
        accumulatedIssues: [],
        escalations: [],
        reviewableFiles,
        filesToReview,
        tokensAccumulator: { value: 0 },
      };

      await session.transition(
        'workspace',
        AGENT_ROLES.orchestrator,
        `Starting agent-driven review loop with ${chunks.length} chunk(s) available (reviewable files: ${reviewableFiles.length}).`,
        withAntigravityMeta({
          chunkCount: chunks.length,
          reviewableFiles: reviewableFiles.length,
          model: GEMINI_ANTIGRAVITY_MODEL,
        }),
      );

      const orchestratorUserMessage = [
        `Repository: ${parsedDiff.repo}`,
        `PR #${parsedDiff.prNumber}`,
        `Title: ${parsedDiff.prTitle}`,
        `Description (abridged): ${parsedDiff.prDescription.slice(0, 2000)}`,
        `Total files in raw diff: ${parsedDiff.files.length}`,
        `Reviewable files (non-empty hunks): ${reviewableFiles.length}`,
        `Total additions/deletions (PR metadata): ${parsedDiff.totalAdditions}/${parsedDiff.totalDeletions}`,
        `Chunks available for tool analyze_chunk — use zero-based chunk_index in 0..${chunks.length - 1} (full diff is not inlined here).`,
        `Changed paths (filenames only, max 80):`,
        ...parsedDiff.files.slice(0, 80).map((f) => `- ${f.filename} (+${f.additions}/-${f.deletions})`),
      ].join('\n');

      const systemInstruction = `${this.personaSystemBlock()}\n\n${ORCHESTRATOR_SYSTEM_PROMPT}`;

      const MAX_AGENT_TURNS = 20;
      let safetyCounter = 0;
      let previousInteractionId: string | undefined;
      let stream = await this.ai.interactions.create({
        model: GEMINI_ANTIGRAVITY_MODEL,
        environment: ANTIGRAVITY_ENV,
        store: true,
        stream: true,
        system_instruction: systemInstruction,
        input: orchestratorUserMessage,
        tools: CODEPULSE_TOOLS,
        generation_config: {
          temperature: 0.2,
          thinking_summaries: 'auto',
        },
      });

      while (safetyCounter < MAX_AGENT_TURNS) {
        safetyCounter += 1;
        const pendingToolCalls: PendingOrchestratorToolCall[] = [];
        let lastInteractionId: string | undefined;
        let finalStatus: string | undefined;

        for await (const event of stream) {
          if (process.env.ANTIGRAVITY_DEBUG === '1') {
            console.log('[ANTIGRAVITY_SSE_DEBUG]', JSON.stringify(event, null, 2));
          }
          await appendGeminiSseToSession(session, event);
          const ev = event as unknown as Record<string, unknown>;
          const et = ev.event_type as string | undefined;

          if (et === 'step.start' && ev.step && typeof ev.step === 'object') {
            const step = ev.step as Record<string, unknown>;
            if (step.type === 'function_call') {
              const id = String(step.id ?? '');
              const name = String(step.name ?? '');
              let initialArgs = '{}';
              if (step.arguments !== undefined && step.arguments !== null) {
                initialArgs =
                  typeof step.arguments === 'string'
                    ? step.arguments
                    : JSON.stringify(step.arguments);
              }
              pendingToolCalls.push({ call_id: id, name, args_buffer: initialArgs });
              await session.step(
                AGENT_ROLES.orchestrator,
                `Agent requested tool: ${name}`,
                withAntigravityMeta({ kind: 'tool_call_requested', tool: name, call_id: id }),
              );
            }
          }

          if (et === 'step.delta' && ev.delta && typeof ev.delta === 'object') {
            const delta = ev.delta as Record<string, unknown>;
            if (delta.type === 'arguments_delta' && typeof delta.arguments === 'string') {
              const pending = pendingToolCalls[pendingToolCalls.length - 1];
              if (pending) {
                pending.args_buffer += delta.arguments;
              }
            }
          }

          if (
            (et === 'interaction.created' || et === 'interaction.completed') &&
            ev.interaction &&
            typeof ev.interaction === 'object'
          ) {
            const inter = ev.interaction as Record<string, unknown>;
            if (typeof inter.id === 'string') {
              lastInteractionId = inter.id;
            }
            if (typeof inter.status === 'string') {
              finalStatus = inter.status;
            }
            if (inter.usage && typeof inter.usage === 'object') {
              ctx.tokensAccumulator.value += usageTokens({
                usage: inter.usage as Record<string, unknown>,
              });
            }
          }

          if (et === 'interaction.status_update') {
            if (typeof ev.status === 'string') {
              finalStatus = ev.status;
            }
            if (typeof ev.interaction_id === 'string') {
              lastInteractionId = ev.interaction_id;
            }
          }
        }

        if (lastInteractionId) {
          previousInteractionId = lastInteractionId;
        }

        if (pendingToolCalls.length === 0 && finalStatus === 'completed') {
          break;
        }

        if (pendingToolCalls.length === 0) {
          if (finalStatus === 'requires_action') {
            await session.thought(
              AGENT_ROLES.orchestrator,
              'Interaction requires_action but no tool calls were parsed from the stream; stopping.',
              withAntigravityMeta({ kind: 'error', finalStatus }),
            );
          }
          break;
        }

        const toolResults: FunctionResultStep[] = [];
        while (pendingToolCalls.length > 0) {
          const call = pendingToolCalls.shift()!;
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(call.args_buffer || '{}') as Record<string, unknown>;
          } catch {
            parsedArgs = {};
          }
          let result: unknown;
          let isError = false;
          try {
            result = await this.executeTool(call.name, parsedArgs, ctx);
          } catch (err) {
            result = { error: err instanceof Error ? err.message : String(err) };
            isError = true;
          }
          toolResults.push({
            type: 'function_result',
            call_id: call.call_id,
            name: call.name,
            result,
            is_error: isError,
          });
        }

        if (!previousInteractionId) {
          await session.thought(
            AGENT_ROLES.orchestrator,
            'Lost interaction id; cannot continue agent loop.',
            withAntigravityMeta({ kind: 'error' }),
          );
          break;
        }

        stream = await this.ai.interactions.create({
          model: GEMINI_ANTIGRAVITY_MODEL,
          environment: ANTIGRAVITY_ENV,
          store: true,
          stream: true,
          previous_interaction_id: previousInteractionId,
          input: toolResults,
          tools: CODEPULSE_TOOLS,
          generation_config: {
            temperature: 0.2,
            thinking_summaries: 'auto',
          },
        });
      }

      if (safetyCounter >= MAX_AGENT_TURNS) {
        await session.thought(
          AGENT_ROLES.orchestrator,
          `Agent loop exceeded MAX_AGENT_TURNS (${MAX_AGENT_TURNS}); finalizing with accumulated issues.`,
          withAntigravityMeta({ kind: 'safety_stop' }),
        );
      }

      await session.step(
        AGENT_ROLES.orchestrator,
        'Applying merge policy: dedupe, credential-pattern scan, severity ordering, and cap.',
        withAntigravityMeta({ rawIssueCount: ctx.accumulatedIssues.length }),
      );

      const allIssues = ctx.accumulatedIssues;
      const deduped = dedupeIssues(allIssues);
      const afterCredentialPass = orchestratorEscalateCredentialLeaks(deduped);
      const criticalIssues = afterCredentialPass.filter((i) => i.severity === 'critical');
      const cappedIssues = sortBySeverity(afterCredentialPass).slice(0, MAX_ISSUES_PER_PR);

      await session.thought(
        AGENT_ROLES.orchestrator,
        `Merged pipeline: raw=${allIssues.length}, after dedupe=${deduped.length}, after credential scan=${afterCredentialPass.length}, CRITICAL count=${criticalIssues.length}, after cap=${cappedIssues.length}.`,
        withAntigravityMeta({
          raw: allIssues.length,
          deduped: deduped.length,
          postCredential: afterCredentialPass.length,
          criticalCount: criticalIssues.length,
          capped: cappedIssues.length,
        }),
      );

      await session.step(
        AGENT_ROLES.orchestrator,
        criticalIssues.length > 0
          ? `CRITICAL scan: ${criticalIssues.length} issue(s) at critical severity (includes credential-pattern escalations). Resend escalation will run for enabled repos.`
          : 'CRITICAL scan: no critical-severity issues after merge and credential-pattern pass.',
        withAntigravityMeta({
          criticalCount: criticalIssues.length,
          criticalTitles: criticalIssues.slice(0, 12).map((i) => i.title),
        }),
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
        tokensUsed: ctx.tokensAccumulator.value,
        model: GEMINI_ANTIGRAVITY_MODEL,
        chunksAnalyzed: ctx.chunks.length,
      });

      const result: AnalysisResult = {
        prNumber: parsedDiff.prNumber,
        repo: parsedDiff.repo,
        headSha: parsedDiff.headSha,
        issues: cappedIssues,
        filesAnalyzed: ctx.filesToReview.length,
        analyzedAt: new Date().toISOString(),
        modelUsed: GEMINI_ANTIGRAVITY_MODEL,
        tokensUsed: ctx.tokensAccumulator.value,
        escalations: ctx.escalations.length > 0 ? ctx.escalations : undefined,
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
