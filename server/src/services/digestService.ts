/** Orchestrates weekly digest aggregation, preview logging, and DigestLog persistence. */

import { DIGEST_PLACEHOLDER_EMAIL_DOMAIN, DIGEST_WEEK_DAYS } from '../config/constants';
import type { DeveloperDigest, DigestResult } from '../types/digest';
import { generateDigestEmail, generateDigestSubject } from './emailTemplateService';
import { digestAggregator } from './digestAggregator';
import logger from '../utils/logger';
import { prisma } from './prismaService';

function getWeekRange(): { weekStart: Date; weekEnd: Date } {
  const weekEnd = new Date();
  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekStart.getDate() - DIGEST_WEEK_DAYS);
  return { weekStart, weekEnd };
}

function buildPlaceholderEmail(githubLogin: string): string {
  return `${githubLogin}@${DIGEST_PLACEHOLDER_EMAIL_DOMAIN}`;
}

export class DigestService {
  async runWeeklyDigest(organizationId?: string): Promise<DigestResult> {
    const { weekStart, weekEnd } = getWeekRange();
    const sentAt = new Date().toISOString();

    const organizations = organizationId
      ? await prisma.organization.findMany({ where: { id: organizationId } })
      : await prisma.organization.findMany();

    if (organizations.length === 0) {
      return {
        organizationId: organizationId ?? 'all',
        digestsSent: 0,
        developerCount: 0,
        errors: organizationId ? ['Organization not found'] : [],
        sentAt,
      };
    }

    let digestsSent = 0;
    let developerCount = 0;
    const errors: string[] = [];

    for (const organization of organizations) {
      try {
        const orgResult = await this.processOrganization(
          organization.id,
          weekStart,
          weekEnd,
        );
        digestsSent += orgResult.digestsSent;
        developerCount += orgResult.developerCount;
        errors.push(...orgResult.errors);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`Organization ${organization.id}: ${message}`);
        logger.error('Failed to process organization digest', {
          organizationId: organization.id,
          error: message,
        });
      }
    }

    return {
      organizationId: organizationId ?? 'all',
      digestsSent,
      developerCount,
      errors,
      sentAt,
    };
  }

  private async processOrganization(
    organizationId: string,
    weekStart: Date,
    weekEnd: Date,
  ): Promise<{ digestsSent: number; developerCount: number; errors: string[] }> {
    const digests = await digestAggregator.aggregateForOrganization({
      organizationId,
      weekStart,
      weekEnd,
    });

    if (digests.length === 0) {
      logger.info('No digests for organization this week', { organizationId });
      return { digestsSent: 0, developerCount: 0, errors: [] };
    }

    let digestsSent = 0;
    const errors: string[] = [];

    for (const digest of digests) {
      try {
        await this.processDeveloperDigest(digest, organizationId, weekStart, weekEnd);
        digestsSent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`Developer ${digest.githubLogin}: ${message}`);
        logger.error('Failed to process developer digest', {
          organizationId,
          developerLogin: digest.githubLogin,
          error: message,
        });
      }
    }

    return { digestsSent, developerCount: digests.length, errors };
  }

  private async processDeveloperDigest(
    digest: DeveloperDigest,
    organizationId: string,
    weekStart: Date,
    weekEnd: Date,
  ): Promise<void> {
    await prisma.developer.findUnique({ where: { id: digest.developerId } });

    const placeholderEmail = buildPlaceholderEmail(digest.githubLogin);
    const subject = generateDigestSubject(digest);
    const html = generateDigestEmail(digest);

    logger.info('Digest preview (email sending requires real addresses)', {
      developerLogin: digest.githubLogin,
      placeholderEmail,
      subject,
      htmlLength: html.length,
      totalIssues: digest.totalIssues,
      issuesByCategory: digest.issuesByCategory,
      issuesBySeverity: digest.issuesBySeverity,
      topFiles: digest.topFiles,
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
    });

    await prisma.digestLog.create({
      data: {
        organizationId,
        developerId: digest.developerId,
        issueCount: digest.totalIssues,
        weekStart,
        weekEnd,
        sentAt: new Date(),
      },
    });
  }
}

export const digestService = new DigestService();
