/** Post-analyze side effects: security escalation, proposed fixes, Sunday micro-lessons. */

import crypto from 'crypto';
import type { AnalyzeDiffWorkspaceContext, AgentTraceLogEntry } from '../types/agentWorkspace';
import type { AnalysisResult, DetectedIssue, IssueCategory } from '../types/analysis';
import { nextSundayDigestUtc } from '../utils/digestSchedule';
import logger from '../utils/logger';
import { databaseService } from './databaseService';
import { resendService } from './resendService';

const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function issueWeight(issue: DetectedIssue): number {
  return SEVERITY_WEIGHT[issue.severity] ?? 1;
}

function extractFencedOrPlainAfterCode(suggestion: string): string {
  const fence = suggestion.match(/```(?:\w+)?\s*([\s\S]*?)```/);
  if (fence?.[1]) {
    return fence[1].trim();
  }
  const trimmed = suggestion.trim();
  return trimmed.length > 0 ? trimmed : '// (no concrete replacement suggested)';
}

function dominantPillarFromIssues(issues: DetectedIssue[]): IssueCategory {
  if (issues.length === 0) {
    return 'best-practices';
  }
  const counts = new Map<string, number>();
  for (const issue of issues) {
    counts.set(issue.category, (counts.get(issue.category) ?? 0) + 1);
  }
  let best: IssueCategory = 'code-quality';
  let bestN = -1;
  for (const [cat, n] of counts) {
    if (n > bestN) {
      bestN = n;
      best = cat as IssueCategory;
    }
  }
  return best;
}

function parseTraceLogs(raw: unknown): AgentTraceLogEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (e): e is AgentTraceLogEntry =>
      typeof e === 'object' &&
      e !== null &&
      'timestamp' in e &&
      'agent' in e &&
      'message' in e &&
      typeof (e as AgentTraceLogEntry).message === 'string',
  );
}

function inferHabitFromTraceAndIssues(
  traceLogs: AgentTraceLogEntry[],
  issues: DetectedIssue[],
): { pillar: IssueCategory; traceHint: string } {
  const habitThought = [...traceLogs]
    .reverse()
    .find((e) => e.agent === '@HabitAnalyzer' && e.kind === 'thought');
  const habitTool = [...traceLogs]
    .reverse()
    .find((e) => e.agent === '@HabitAnalyzer' && e.kind === 'tool');

  const pillar = dominantPillarFromIssues(issues);
  const parts: string[] = [];
  if (habitTool?.message) {
    parts.push(`Session tool: ${habitTool.message}`);
  }
  if (habitThought?.message) {
    parts.push(`Habit agent: ${habitThought.message}`);
  }
  if (parts.length === 0) {
    parts.push(`Dominant issue category in this review: ${pillar}.`);
  }
  return { pillar, traceHint: parts.join(' ') };
}

function buildMicroLessonMarkdown(params: {
  pillar: IssueCategory;
  developerLogin: string;
  repoFullName: string;
  prNumber: number;
  prTitle: string;
  traceHint: string;
  topIssueTitle: string;
}): { lessonTitle: string; lessonMarkdown: string } {
  const lessonTitle = `Sunday micro-lesson: tighten your ${params.pillar} loop`;
  const lessonMarkdown = `## ${lessonTitle}

**Author:** @${params.developerLogin}  
**Context:** Review feedback on \`${params.repoFullName}#${params.prNumber}\` — _${params.prTitle}_

### Habit signal (from this agent session)
${params.traceHint}

### Focus pillar
**${params.pillar}** — recurring patterns in this PR cluster here.

### Smallest practice loop (15 minutes)
1. Re-open the flagged hunk for: _${params.topIssueTitle}_.
2. Write the invariant this code must preserve (one sentence).
3. Apply the smallest change that satisfies the invariant; run tests.
4. Ship; repeat on the next PR until the pattern feels automatic.

---
_Queued automatically by CodePulse Antigravity @HabitAnalyzer / @Orchestrator._`;

  return { lessonTitle, lessonMarkdown };
}

function selectIssuesForProposedFixes(issues: DetectedIssue[]): DetectedIssue[] {
  if (issues.length === 0) {
    return [];
  }
  const byFile = new Map<string, DetectedIssue[]>();
  for (const issue of issues) {
    const list = byFile.get(issue.file) ?? [];
    list.push(issue);
    byFile.set(issue.file, list);
  }
  const ranked = [...byFile.entries()]
    .map(([file, list]) => ({
      file,
      score: list.reduce((s, i) => s + issueWeight(i), 0),
      list,
    }))
    .sort((a, b) => b.score - a.score);

  const topFiles = new Set(ranked.slice(0, 3).map((r) => r.file));
  const picked: DetectedIssue[] = [];
  for (const issue of issues) {
    if (topFiles.has(issue.file) && issue.codeSnippet.trim().length > 0) {
      picked.push(issue);
      if (picked.length >= 25) {
        break;
      }
    }
  }
  return picked;
}

export async function escalateCriticalFindingsIfNeeded(params: {
  analysisResult: AnalysisResult;
  repositoryId: string | undefined;
  repoFullName: string;
  prNumber: number;
  prTitle: string;
  prAuthorLogin: string;
}): Promise<void> {
  try {
    const critical = params.analysisResult.issues.filter((i) => i.severity === 'critical');
    if (critical.length === 0 || !params.repositoryId) {
      return;
    }

    const settings = await databaseService.getRepositorySettingsByRepositoryId(params.repositoryId);
    if (!settings?.teamLeadEmail?.trim() || !settings.escalationEnabled) {
      logger.info('Critical findings present but escalation skipped', {
        repo: params.repoFullName,
        prNumber: params.prNumber,
        hasEmail: Boolean(settings?.teamLeadEmail?.trim()),
        escalationEnabled: settings?.escalationEnabled ?? false,
      });
      return;
    }

    const hasSecurity = critical.some((i) => i.category === 'security');
    await resendService.sendCriticalEscalationAlert({
      to: settings.teamLeadEmail.trim(),
      repoFullName: params.repoFullName,
      prNumber: params.prNumber,
      prTitle: params.prTitle,
      prAuthorLogin: params.prAuthorLogin,
      findingCount: critical.length,
      findings: critical.slice(0, 12).map((i) => ({
        title: i.title,
        file: i.file,
        line: i.line,
        category: i.category,
      })),
      headline: hasSecurity ? 'Critical findings (includes security)' : 'Critical code review findings',
      subjectPrefix: hasSecurity ? '[CRITICAL SECURITY]' : '[CRITICAL]',
    });
  } catch (error) {
    logger.error('Critical escalation handler failed (non-fatal)', {
      repo: params.repoFullName,
      prNumber: params.prNumber,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

export async function persistProposedCodeFixesIfPossible(params: {
  analysisResult: AnalysisResult;
  pullRequestId: string | undefined;
}): Promise<void> {
  try {
    const pullRequestId = params.pullRequestId;
    if (!pullRequestId || params.analysisResult.issues.length === 0) {
      return;
    }
    const rows = selectIssuesForProposedFixes(params.analysisResult.issues).map((issue) => ({
      id: crypto.randomUUID(),
      pullRequestId,
      fileName: issue.file,
      beforeCode: issue.codeSnippet,
      afterCode: extractFencedOrPlainAfterCode(issue.suggestion),
      lineHunk: `@@ ${issue.file}:${issue.line} @@`,
    }));
    if (rows.length === 0) {
      return;
    }
    await databaseService.createProposedCodeFixes(rows);
    logger.info('ProposedCodeFix rows persisted', {
      pullRequestId: params.pullRequestId,
      count: rows.length,
    });
  } catch (error) {
    logger.error('ProposedCodeFix persistence failed (non-fatal)', {
      pullRequestId: params.pullRequestId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

export async function queueSundayMicroLessonIfPossible(params: {
  analysisResult: AnalysisResult;
  pullRequestId: string | undefined;
  developerId: string | undefined;
  repoFullName: string;
  prNumber: number;
  prTitle: string;
  developerLogin: string;
}): Promise<void> {
  try {
    if (
      !params.pullRequestId ||
      !params.developerId ||
      params.analysisResult.issues.length === 0
    ) {
      return;
    }

    const trace = await databaseService.getLatestAgentTraceByPullRequestId(params.pullRequestId);
    const traceLogs = trace?.logs !== undefined ? parseTraceLogs(trace.logs) : [];
    const { pillar, traceHint } = inferHabitFromTraceAndIssues(
      traceLogs,
      params.analysisResult.issues,
    );

    const topIssue = [...params.analysisResult.issues].sort(
      (a, b) => issueWeight(b) - issueWeight(a),
    )[0];

    const { lessonTitle, lessonMarkdown } = buildMicroLessonMarkdown({
      pillar,
      developerLogin: params.developerLogin,
      repoFullName: params.repoFullName,
      prNumber: params.prNumber,
      prTitle: params.prTitle,
      traceHint,
      topIssueTitle: topIssue?.title ?? 'Review findings',
    });

    const targetSunday = nextSundayDigestUtc();
    await databaseService.createCustomIntervention({
      developerId: params.developerId,
      targetPillar: pillar,
      lessonTitle,
      lessonMarkdown,
      status: 'QUEUED',
      targetSunday,
    });

    logger.info('CustomIntervention queued for Sunday digest', {
      developerId: params.developerId,
      pillar,
      targetSunday: targetSunday.toISOString(),
    });
  } catch (error) {
    logger.error('CustomIntervention queue failed (non-fatal)', {
      pullRequestId: params.pullRequestId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

export async function runPostAnalysisDownstreamActions(params: {
  analysisResult: AnalysisResult;
  workspaceCtx: AnalyzeDiffWorkspaceContext | undefined;
  githubRepoId: number;
  repoFullName: string;
  prNumber: number;
  prTitle: string;
  prAuthorLogin: string;
}): Promise<void> {
  try {
    let repositoryId = params.workspaceCtx?.repositoryId;
    const pullRequestId = params.workspaceCtx?.pullRequestId;
    const developerId = params.workspaceCtx?.developerId;

    if (!repositoryId) {
      try {
        const row = await databaseService.findRepositoryIdByGithubRepoId(params.githubRepoId);
        repositoryId = row?.id;
      } catch (error) {
        logger.error('Repository lookup for downstream actions failed (non-fatal)', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await escalateCriticalFindingsIfNeeded({
      analysisResult: params.analysisResult,
      repositoryId,
      repoFullName: params.repoFullName,
      prNumber: params.prNumber,
      prTitle: params.prTitle,
      prAuthorLogin: params.prAuthorLogin,
    });

    await persistProposedCodeFixesIfPossible({
      analysisResult: params.analysisResult,
      pullRequestId,
    });

    await queueSundayMicroLessonIfPossible({
      analysisResult: params.analysisResult,
      pullRequestId,
      developerId,
      repoFullName: params.repoFullName,
      prNumber: params.prNumber,
      prTitle: params.prTitle,
      developerLogin: params.prAuthorLogin,
    });
  } catch (error) {
    logger.error('Post-analysis downstream pipeline failed (non-fatal)', {
      repo: params.repoFullName,
      prNumber: params.prNumber,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}
