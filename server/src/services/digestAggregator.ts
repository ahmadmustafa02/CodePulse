/** Aggregates issue data from the database into per-developer weekly digests. */

import { DIGEST_TOP_FILES_LIMIT } from '../config/constants';
import type { DeveloperDigest } from '../types/digest';
import logger from '../utils/logger';
import { prisma } from './prismaService';

type AggregateParams = {
  organizationId: string;
  weekStart: Date;
  weekEnd: Date;
};

function countByField(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function buildTopFiles(files: string[]): Array<{ file: string; count: number }> {
  const counts = countByField(files);
  return Object.entries(counts)
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, DIGEST_TOP_FILES_LIMIT);
}

function buildDeveloperDigest(
  developerId: string,
  githubLogin: string,
  issues: Array<{ category: string; severity: string; file: string }>,
  weekStart: Date,
  weekEnd: Date,
): DeveloperDigest {
  return {
    developerId,
    githubLogin,
    totalIssues: issues.length,
    issuesByCategory: countByField(issues.map((issue) => issue.category)),
    issuesBySeverity: countByField(issues.map((issue) => issue.severity)),
    topFiles: buildTopFiles(issues.map((issue) => issue.file)),
    weekStart,
    weekEnd,
  };
}

export class DigestAggregator {
  async aggregateForOrganization(params: AggregateParams): Promise<DeveloperDigest[]> {
    const { organizationId, weekStart, weekEnd } = params;

    const issues = await prisma.issue.findMany({
      where: {
        organizationId,
        createdAt: { gte: weekStart, lte: weekEnd },
      },
      include: { developer: true },
    });

    if (issues.length === 0) {
      logger.info('No issues found for digest aggregation', {
        organizationId,
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
      });
      return [];
    }

    const issuesByDeveloper = new Map<string, typeof issues>();
    for (const issue of issues) {
      const existing = issuesByDeveloper.get(issue.developerId) ?? [];
      existing.push(issue);
      issuesByDeveloper.set(issue.developerId, existing);
    }

    const digests: DeveloperDigest[] = [];
    for (const [developerId, developerIssues] of issuesByDeveloper) {
      const githubLogin = developerIssues[0]?.developer.githubLogin ?? 'unknown';
      digests.push(
        buildDeveloperDigest(developerId, githubLogin, developerIssues, weekStart, weekEnd),
      );
    }

    return digests.sort((a, b) => b.totalIssues - a.totalIssues);
  }
}

export const digestAggregator = new DigestAggregator();
