/** Google Antigravity multi-agent workflow: triage, review, and guardrail with live AgentTrace persistence. */

import { DeploymentState } from '@prisma/client';
import type { AnalysisResult } from '../types/analysis';
import type { ParsedDiff } from '../types/diff';
import logger from '../utils/logger';
import { githubDiffService } from './githubDiffService';
import { groqAnalysisService } from './groqAnalysisService';
import { prisma } from './prismaService';

const AGENT_TRIAGE = 'TriageAgent';
const AGENT_REVIEW = 'ReviewAgent';
const AGENT_GUARDRAIL = 'GuardrailAgent';

const CRITICAL_PATH_KEYWORDS = ['auth', 'config', 'db', 'routes', 'vulnerability'] as const;

export type AntigravityReviewContext = {
  headSha: string;
  prTitle: string;
  prDescription: string;
  repo: string;
};

export type AntigravityWorkflowResult = {
  analysisResult: AnalysisResult;
  isCriticalPath: boolean;
  mitigationTriggered: boolean;
};

type WriteTraceParams = {
  repositoryId: string;
  prNumber: number;
  agentName: string;
  message: string;
  status: string;
};

async function writeAgentTrace(params: WriteTraceParams): Promise<void> {
  await prisma.agentTrace.create({
    data: {
      repositoryId: params.repositoryId,
      prNumber: params.prNumber,
      agentName: params.agentName,
      message: params.message,
      status: params.status,
    },
  });
}

function repoFromPrUrl(prUrl: string): string {
  const match = prUrl.match(/github\.com\/([^/]+\/[^/]+)\/pull\//i);
  return match?.[1] ?? 'unknown/unknown';
}

function isCriticalPathFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return CRITICAL_PATH_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function countCriticalOrHighIssues(issues: AnalysisResult['issues']): number {
  return issues.filter((issue) => issue.severity === 'critical' || issue.severity === 'high').length;
}

async function dispatchEmergencyDevOpsAlert(payload: {
  repositoryId: string;
  prNumber: number;
  prUrl: string;
  developerName: string;
  reason: string;
}): Promise<void> {
  logger.warn('Mock DevOps alert dispatched (Slack placeholder)', payload);
}

export async function runAntigravityWorkflow(
  repoId: string,
  prNumber: number,
  prUrl: string,
  developerName: string,
  changedFiles: string[],
  diffContent: string,
  reviewContext?: AntigravityReviewContext,
): Promise<AntigravityWorkflowResult> {
  try {
    const repo = reviewContext?.repo ?? repoFromPrUrl(prUrl);
    const parsedDiff: ParsedDiff = githubDiffService.parseRawDiff(diffContent, {
      prNumber,
      repo,
      headSha: reviewContext?.headSha ?? '',
      prTitle: reviewContext?.prTitle ?? `PR #${prNumber}`,
      prDescription: reviewContext?.prDescription ?? `Author: ${developerName}`,
    });

    let isCriticalPath = false;

    const triageBaseMessage = 'Analyzing PR metadata and file changes for risk assessment.';
    const criticalFiles = changedFiles.filter(isCriticalPathFile);

    if (criticalFiles.length > 0) {
      isCriticalPath = true;
      await writeAgentTrace({
        repositoryId: repoId,
        prNumber,
        agentName: AGENT_TRIAGE,
        message: `${triageBaseMessage} High-risk paths detected: ${criticalFiles.join(', ')}.`,
        status: 'FLAGGED',
      });
    } else {
      await writeAgentTrace({
        repositoryId: repoId,
        prNumber,
        agentName: AGENT_TRIAGE,
        message: `${triageBaseMessage} No high-risk directory changes detected; proceeding with standard review.`,
        status: 'SUCCESS',
      });
    }

    const reviewBaseMessage =
      'Initiating two-pass code review analysis using Llama 3.3 70B via Groq.';
    const analysisResult = await groqAnalysisService.analyzeDiff(parsedDiff);
    const criticalOrHighCount = countCriticalOrHighIssues(analysisResult.issues);

    if (criticalOrHighCount > 0) {
      await writeAgentTrace({
        repositoryId: repoId,
        prNumber,
        agentName: AGENT_REVIEW,
        message: `${reviewBaseMessage} Found ${criticalOrHighCount} critical or high severity issue(s).`,
        status: 'FLAGGED',
      });
    } else {
      await writeAgentTrace({
        repositoryId: repoId,
        prNumber,
        agentName: AGENT_REVIEW,
        message: `${reviewBaseMessage} No critical or high severity vulnerabilities detected.`,
        status: 'SUCCESS',
      });
    }

    const guardrailBaseMessage =
      'Evaluating code safety implications against active system guardrails.';
    const enterMitigation = isCriticalPath || criticalOrHighCount > 0;

    if (enterMitigation) {
      await prisma.repository.update({
        where: { id: repoId },
        data: {
          deploymentState: DeploymentState.QUARANTINED,
          lastIncidentPr: String(prNumber),
        },
      });

      await writeAgentTrace({
        repositoryId: repoId,
        prNumber,
        agentName: AGENT_GUARDRAIL,
        message:
          'CRITICAL THREAT ISOLATED. Staging deployment frozen automatically. Dispatched emergency DevOps alert payload.',
        status: 'EXECUTED',
      });

      await dispatchEmergencyDevOpsAlert({
        repositoryId: repoId,
        prNumber,
        prUrl,
        developerName,
        reason: isCriticalPath
          ? 'critical_path_change'
          : 'critical_or_high_severity_findings',
      });

      return {
        analysisResult,
        isCriticalPath,
        mitigationTriggered: true,
      };
    }

    await prisma.repository.update({
      where: { id: repoId },
      data: {
        deploymentState: DeploymentState.ACTIVE,
        lastIncidentPr: null,
      },
    });

    await writeAgentTrace({
      repositoryId: repoId,
      prNumber,
      agentName: AGENT_GUARDRAIL,
      message: `${guardrailBaseMessage} Guardrails clear. Codebase adheres to organizational compliance.`,
      status: 'SUCCESS',
    });

    return {
      analysisResult,
      isCriticalPath,
      mitigationTriggered: false,
    };
  } catch (error) {
    logger.error('Antigravity workflow failed', {
      repositoryId: repoId,
      prNumber,
      prUrl,
      developerName,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}
