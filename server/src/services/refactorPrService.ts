/**
 * Phase 4: optional verified refactor PRs for maintainability findings.
 * Caps + org flag are checked before Groq and before sandbox spin-up.
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import Groq from 'groq-sdk';
import { Octokit } from '@octokit/rest';
import { z } from 'zod';
import {
  GROQ_MAX_COMPLETION_TOKENS,
  GROQ_MODEL,
  REFACTOR_ELIGIBLE_CATEGORIES,
} from '../config/constants';
import { env } from '../config/env';
import { prisma } from './prismaService';
import type { DetectedIssue } from '../types/analysis';
import type { ReviewJobPayload } from '../types/reviewJob';
import type { PipelineTracer } from './traceService';
import { githubAuthService } from './githubAuthService';
import { refactorSandboxService } from './refactorSandboxService';
import logger from '../utils/logger';

const execFileAsync = promisify(execFile);

const patchResponseSchema = z.object({
  unifiedDiff: z.string().min(1),
  rationale: z.string().min(1),
  branchSuffix: z.string().min(1).max(40).optional(),
});

export type RefactorAttemptStatus =
  | 'success'
  | 'rejected-by-gate'
  | 'failed'
  | 'capped'
  | 'skipped-flag-off';

function findingKey(issue: DetectedIssue): string {
  const raw = `${issue.file}|${issue.line}|${issue.category}|${issue.title}`.toLowerCase();
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

function isEligible(issue: DetectedIssue): boolean {
  return (REFACTOR_ELIGIBLE_CATEGORIES as readonly string[]).includes(issue.category);
}

function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const PATCH_SYSTEM = `You generate minimal unified diffs to fix maintainability issues in TypeScript/JavaScript Node repos.
Return ONLY valid JSON: {"unifiedDiff":"...","rationale":"...","branchSuffix":"short-kebab"}.
Rules:
- unifiedDiff must be applyable with git apply -p1 (include ---/+++ file headers).
- Change only what is needed for the stated finding.
- Do not touch secrets, lockfile wholesale rewrites, or unrelated files.
- Prefer small, reviewable edits.`;

export class RefactorPrService {
  private groq = new Groq({ apiKey: env.GROQ_API_KEY });

  async maybeOpenRefactorPrs(params: {
    jobId: string;
    organizationId: string;
    payload: ReviewJobPayload;
    issues: DetectedIssue[];
    tracer: PipelineTracer;
  }): Promise<void> {
    const { jobId, organizationId, payload, issues, tracer } = params;
    const org = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) {
      logger.warn('Refactor PR skipped; organization missing', { organizationId, jobId });
      return;
    }

    if (!org.refactorPrEnabled) {
      logger.info('Refactor PR feature flag OFF; skipping', {
        jobId,
        organizationId,
      });
      return;
    }

    const eligible = issues.filter(isEligible);
    if (eligible.length === 0) {
      return;
    }

    await tracer.run(
      'refactor_attempt_batch',
      async () => {
        for (const issue of eligible) {
          await this.attemptOne({
            jobId,
            org,
            payload,
            issue,
          });
        }
      },
      { eligibleCount: eligible.length },
    );
  }

  private async attemptOne(params: {
    jobId: string;
    org: {
      id: string;
      refactorPrPerPrCap: number;
      refactorPrDailyCap: number;
    };
    payload: ReviewJobPayload;
    issue: DetectedIssue;
  }): Promise<void> {
    const { jobId, org, payload, issue } = params;
    const key = findingKey(issue);
    const baseFields = {
      organizationId: org.id,
      reviewJobId: jobId,
      sourcePrNumber: payload.pullNumber,
      sourceHeadSha: payload.headSha,
      findingKey: key,
      findingCategory: issue.category,
      findingTitle: issue.title,
      findingFile: issue.file,
      findingLine: issue.line,
    };

    const existing = await prisma.refactorAttempt.findUnique({
      where: {
        organizationId_sourcePrNumber_sourceHeadSha_findingKey: {
          organizationId: org.id,
          sourcePrNumber: payload.pullNumber,
          sourceHeadSha: payload.headSha,
          findingKey: key,
        },
      },
    });
    if (existing) {
      logger.info('Refactor attempt already recorded for finding/headSha', {
        jobId,
        findingKey: key,
        status: existing.status,
      });
      return;
    }

    // Caps BEFORE Groq and BEFORE sandbox.
    const perPrCount = await prisma.refactorAttempt.count({
      where: {
        organizationId: org.id,
        sourcePrNumber: payload.pullNumber,
        sourceHeadSha: payload.headSha,
        status: { not: 'skipped-flag-off' },
      },
    });
    if (perPrCount >= org.refactorPrPerPrCap) {
      await this.record({ ...baseFields, status: 'capped', detail: 'per-PR cap reached' });
      logger.info('Refactor capped (per-PR)', { jobId, perPrCount, cap: org.refactorPrPerPrCap });
      return;
    }

    const dailyCount = await prisma.refactorAttempt.count({
      where: {
        organizationId: org.id,
        createdAt: { gte: startOfUtcDay() },
        status: { not: 'skipped-flag-off' },
      },
    });
    if (dailyCount >= org.refactorPrDailyCap) {
      await this.record({ ...baseFields, status: 'capped', detail: 'daily cap reached' });
      logger.info('Refactor capped (daily)', { jobId, dailyCount, cap: org.refactorPrDailyCap });
      return;
    }

    let patch: z.infer<typeof patchResponseSchema>;
    try {
      patch = await this.generatePatch(issue);
    } catch (error) {
      await this.record({
        ...baseFields,
        status: 'failed',
        detail: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    let repoDir: string | null = null;
    try {
      repoDir = await this.materializeRepoAtHead(payload);
      const gate = await refactorSandboxService.verifyPatch({
        repoDir,
        patchUnifiedDiff: patch.unifiedDiff,
      });

      if (!gate.ok) {
        await this.record({
          ...baseFields,
          status: gate.reason,
          detail: gate.detail,
        });
        logger.info('Refactor rejected by sandbox gate', {
          jobId,
          findingKey: key,
          reason: gate.reason,
        });
        return;
      }

      const opened = await this.openRefactorPullRequest({
        payload,
        issue,
        patch,
      });

      await this.record({
        ...baseFields,
        status: 'success',
        detail: patch.rationale,
        refactorPrNumber: opened.number,
        refactorPrUrl: opened.htmlUrl,
      });
      logger.info('Refactor PR opened after sandbox pass', {
        jobId,
        findingKey: key,
        prNumber: opened.number,
        url: opened.htmlUrl,
      });
    } catch (error) {
      await this.record({
        ...baseFields,
        status: 'failed',
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (repoDir) {
        await fs.rm(repoDir, { recursive: true, force: true });
      }
    }
  }

  private async record(data: {
    organizationId: string;
    reviewJobId: string;
    sourcePrNumber: number;
    sourceHeadSha: string;
    findingKey: string;
    findingCategory: string;
    findingTitle: string;
    findingFile: string;
    findingLine: number;
    status: RefactorAttemptStatus;
    detail?: string;
    refactorPrNumber?: number;
    refactorPrUrl?: string;
  }): Promise<void> {
    await prisma.refactorAttempt.create({ data });
  }

  private async generatePatch(issue: DetectedIssue): Promise<z.infer<typeof patchResponseSchema>> {
    const response = await this.groq.chat.completions.create({
      model: GROQ_MODEL,
      max_tokens: GROQ_MAX_COMPLETION_TOKENS,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PATCH_SYSTEM },
        {
          role: 'user',
          content: JSON.stringify({
            file: issue.file,
            line: issue.line,
            category: issue.category,
            severity: issue.severity,
            title: issue.title,
            explanation: issue.explanation,
            suggestion: issue.suggestion,
            codeSnippet: issue.codeSnippet,
          }),
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty patch response from Groq');
    }
    const parsed = patchResponseSchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      throw new Error(`Invalid patch JSON: ${parsed.error.message}`);
    }
    return parsed.data;
  }

  /**
   * Clone/fetch the target repo at headSha into a temp dir using installation token.
   * Credentials stay on the worker; the sandbox copy strips .git and secrets.
   */
  private async materializeRepoAtHead(payload: ReviewJobPayload): Promise<string> {
    const token = await githubAuthService.getInstallationToken(payload.installationId);
    const dest = await fs.mkdtemp(path.join(os.tmpdir(), 'codepulse-repo-'));
    const remote = `https://x-access-token:${token}@github.com/${payload.owner}/${payload.repo}.git`;

    await execFileAsync('git', ['clone', '--depth', '1', remote, dest], {
      timeout: 120_000,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    });

    // Checkout exact head when possible (depth-1 may miss; fetch the SHA).
    try {
      await execFileAsync('git', ['fetch', '--depth', '1', 'origin', payload.headSha], {
        cwd: dest,
        timeout: 120_000,
        windowsHide: true,
      });
      await execFileAsync('git', ['checkout', payload.headSha], {
        cwd: dest,
        timeout: 60_000,
        windowsHide: true,
      });
    } catch {
      logger.warn('Could not checkout exact headSha; using default clone HEAD', {
        headSha: payload.headSha,
        repo: payload.fullName,
      });
    }

    // Remove remote URL so copied trees never retain the token.
    await execFileAsync('git', ['remote', 'remove', 'origin'], {
      cwd: dest,
      windowsHide: true,
    }).catch(() => undefined);

    return dest;
  }

  private async openRefactorPullRequest(params: {
    payload: ReviewJobPayload;
    issue: DetectedIssue;
    patch: z.infer<typeof patchResponseSchema>;
  }): Promise<{ number: number; htmlUrl: string }> {
    const { payload, issue, patch } = params;
    const token = await githubAuthService.getInstallationToken(payload.installationId);
    const octokit = new Octokit({ auth: token });

    const suffix =
      patch.branchSuffix?.replace(/[^a-z0-9-]/gi, '-').slice(0, 30) ||
      findingKey(issue).slice(0, 8);
    const branch = `codepulse/refactor-${payload.pullNumber}-${suffix}`;

    const { data: baseRef } = await octokit.rest.git.getRef({
      owner: payload.owner,
      repo: payload.repo,
      ref: `heads/${payload.baseBranch}`,
    });

    // Create branch from source head when possible, else base.
    let baseSha = payload.headSha;
    try {
      await octokit.rest.git.getCommit({
        owner: payload.owner,
        repo: payload.repo,
        commit_sha: payload.headSha,
      });
    } catch {
      baseSha = baseRef.object.sha;
    }

    try {
      await octokit.rest.git.createRef({
        owner: payload.owner,
        repo: payload.repo,
        ref: `refs/heads/${branch}`,
        sha: baseSha,
      });
    } catch (error: unknown) {
      const status = (error as { status?: number }).status;
      if (status !== 422) throw error;
      // Branch exists — reuse.
    }

    await this.applyPatchViaApi({
      octokit,
      owner: payload.owner,
      repo: payload.repo,
      branch,
      baseSha,
      unifiedDiff: patch.unifiedDiff,
      message: `fix(${issue.category}): ${issue.title}`,
    });

    const body = [
      `## CodePulse verified refactor`,
      '',
      patch.rationale,
      '',
      `**Source finding** (from PR #${payload.pullNumber} @ \`${payload.headSha.slice(0, 7)}\`):`,
      `- **${issue.title}** (\`${issue.category}\` / ${issue.severity})`,
      `- \`${issue.file}:${issue.line}\``,
      '',
      `_This PR was opened only after typecheck → tests → build passed in an ephemeral Docker sandbox with no worker secrets and cloud metadata endpoints blocked._`,
    ].join('\n');

    const { data: pr } = await octokit.rest.pulls.create({
      owner: payload.owner,
      repo: payload.repo,
      title: `refactor: ${issue.title}`,
      head: branch,
      base: payload.baseBranch,
      body,
    });

    return { number: pr.number, htmlUrl: pr.html_url };
  }

  /**
   * Minimal unified-diff applier via Contents API for single-file style patches.
   * Multi-file: parse --- a/ / +++ b/ headers and update each path.
   */
  private async applyPatchViaApi(params: {
    octokit: Octokit;
    owner: string;
    repo: string;
    branch: string;
    baseSha: string;
    unifiedDiff: string;
    message: string;
  }): Promise<void> {
    const { octokit, owner, repo, branch, unifiedDiff, message } = params;
    const files = parseUnifiedDiffFiles(unifiedDiff);
    if (files.length === 0) {
      throw new Error('Patch contained no file hunks');
    }

    for (const file of files) {
      if (file.deleted) {
        try {
          const { data: existing } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: file.path,
            ref: branch,
          });
          if (!Array.isArray(existing) && existing.type === 'file' && existing.sha) {
            await octokit.rest.repos.deleteFile({
              owner,
              repo,
              path: file.path,
              message,
              sha: existing.sha,
              branch,
            });
          }
        } catch {
          // ignore missing
        }
        continue;
      }

      let sha: string | undefined;
      let original = '';
      try {
        const { data: existing } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: file.path,
          ref: branch,
        });
        if (!Array.isArray(existing) && existing.type === 'file') {
          sha = existing.sha;
          original = Buffer.from(existing.content, 'base64').toString('utf8');
        }
      } catch {
        original = '';
      }

      const next = applyHunksToContent(original, file.hunks);
      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: file.path,
        message,
        content: Buffer.from(next, 'utf8').toString('base64'),
        branch,
        sha,
      });
    }
  }
}

type DiffFile = {
  path: string;
  deleted: boolean;
  hunks: string[];
};

function parseUnifiedDiffFiles(diff: string): DiffFile[] {
  const lines = diff.replace(/\r\n/g, '\n').split('\n');
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;
  let hunkBuf: string[] = [];

  const flushHunk = () => {
    if (current && hunkBuf.length) {
      current.hunks.push(hunkBuf.join('\n'));
      hunkBuf = [];
    }
  };

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      flushHunk();
      if (current) files.push(current);
      current = null;
      continue;
    }
    if (line.startsWith('--- ')) {
      flushHunk();
      continue;
    }
    if (line.startsWith('+++ ')) {
      flushHunk();
      const raw = line.slice(4).trim();
      const pathPart = raw.startsWith('b/') ? raw.slice(2) : raw;
      if (pathPart === '/dev/null') {
        if (current) current.deleted = true;
      } else {
        current = { path: pathPart, deleted: false, hunks: [] };
      }
      continue;
    }
    if (line.startsWith('@@')) {
      flushHunk();
      hunkBuf = [line];
      continue;
    }
    if (hunkBuf.length) {
      hunkBuf.push(line);
    }
  }
  flushHunk();
  if (current) files.push(current);
  return files;
}

function applyHunksToContent(original: string, hunks: string[]): string {
  if (hunks.length === 0) return original;
  // Prefer patch(1) when available for correctness; fall back to simple +/- replay.
  const lines = original.length ? original.split('\n') : [];
  // If original ends with newline, split keeps trailing ''; normalize after.
  let result = [...lines];

  for (const hunk of hunks) {
    const hunkLines = hunk.split('\n');
    const header = hunkLines[0] ?? '';
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(header);
    if (!match) continue;
    const oldStart = Number(match[1]);
    let idx = Math.max(0, oldStart - 1);
    const out: string[] = [];
    // Copy prefix
    out.push(...result.slice(0, idx));
    let oldConsumed = 0;
    const oldCount = match[2] !== undefined ? Number(match[2]) : 1;

    for (let i = 1; i < hunkLines.length; i++) {
      const hl = hunkLines[i];
      if (hl.startsWith('\\')) continue;
      const tag = hl[0];
      const body = hl.slice(1);
      if (tag === ' ') {
        out.push(body);
        idx += 1;
        oldConsumed += 1;
      } else if (tag === '-') {
        idx += 1;
        oldConsumed += 1;
      } else if (tag === '+') {
        out.push(body);
      }
    }
    // Skip any remaining old lines in the hunk range that weren't listed (shouldn't happen)
    while (oldConsumed < oldCount && idx < result.length) {
      idx += 1;
      oldConsumed += 1;
    }
    out.push(...result.slice(idx));
    result = out;
  }

  let text = result.join('\n');
  if (original.endsWith('\n') && !text.endsWith('\n')) {
    text += '\n';
  }
  return text;
}

export const refactorPrService = new RefactorPrService();
