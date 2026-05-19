/** Orchestrates weekly digest aggregation, Resend delivery, and DigestLog persistence. */

import { DIGEST_WEEK_DAYS } from '../config/constants';
import type { DeveloperDigest, DigestPreferences, DigestResult } from '../types/digest';
import { generateDigestEmail, generateDigestSubject } from './emailTemplateService';
import { digestAggregator } from './digestAggregator';
import { databaseService } from './databaseService';
import logger from '../utils/logger';
import { prisma } from './prismaService';
import { resendService } from './resendService';

type DigestRecipient = {
  email: string;
  digestEmailEnabled: boolean;
};

type DeveloperDigestOutcome = 'sent' | 'skipped_no_email' | 'skipped_opt_out';

function getWeekRange(): { weekStart: Date; weekEnd: Date } {
  const weekEnd = new Date();
  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekStart.getDate() - DIGEST_WEEK_DAYS);
  return { weekStart, weekEnd };
}

async function resolveDigestRecipient(githubLogin: string): Promise<DigestRecipient | null> {
  const user = await prisma.user.findUnique({
    where: { githubLogin },
    select: { email: true, digestEmailEnabled: true },
  });
  if (!user) {
    return null;
  }
  const email = user.email?.trim();
  if (!email || email.length === 0) {
    return null;
  }
  return { email, digestEmailEnabled: user.digestEmailEnabled };
}

export class DigestService {
  async getPreferences(githubUserId: bigint): Promise<DigestPreferences | null> {
    return databaseService.getDigestPreferences(githubUserId);
  }

  async setPreferences(githubUserId: bigint, digestEmailEnabled: boolean): Promise<DigestPreferences> {
    const user = await databaseService.setDigestEmailEnabled(githubUserId, digestEmailEnabled);
    const email = user.email?.trim();
    return {
      digestEmailEnabled: user.digestEmailEnabled,
      hasEmail: Boolean(email && email.length > 0),
    };
  }

  async runWeeklyDigest(organizationId?: string): Promise<DigestResult> {
    const { weekStart, weekEnd } = getWeekRange();
    const sentAt = new Date().toISOString();

    const organizations = organizationId
      ? await prisma.organization.findMany({ where: { id: organizationId } })
      : await prisma.organization.findMany();

    if (organizations.length === 0) {
      return {
        organizationId: organizationId ?? 'all',
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
        organizationsProcessed: 0,
        developerCount: 0,
        digestsSent: 0,
        skippedNoEmail: 0,
        skippedOptOut: 0,
        errors: organizationId ? ['Organization not found'] : [],
        sentAt,
      };
    }

    let digestsSent = 0;
    let developerCount = 0;
    let skippedNoEmail = 0;
    let skippedOptOut = 0;
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
        skippedNoEmail += orgResult.skippedNoEmail;
        skippedOptOut += orgResult.skippedOptOut;
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
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      organizationsProcessed: organizations.length,
      developerCount,
      digestsSent,
      skippedNoEmail,
      skippedOptOut,
      errors,
      sentAt,
    };
  }

  private async processOrganization(
    organizationId: string,
    weekStart: Date,
    weekEnd: Date,
  ): Promise<{
    digestsSent: number;
    developerCount: number;
    skippedNoEmail: number;
    skippedOptOut: number;
    errors: string[];
  }> {
    const digests = await digestAggregator.aggregateForOrganization({
      organizationId,
      weekStart,
      weekEnd,
    });

    if (digests.length === 0) {
      logger.info('No digests for organization this week', { organizationId });
      return {
        digestsSent: 0,
        developerCount: 0,
        skippedNoEmail: 0,
        skippedOptOut: 0,
        errors: [],
      };
    }

    let digestsSent = 0;
    let skippedNoEmail = 0;
    let skippedOptOut = 0;
    const errors: string[] = [];

    for (const digest of digests) {
      try {
        const outcome = await this.processDeveloperDigest(
          digest,
          organizationId,
          weekStart,
          weekEnd,
        );
        if (outcome === 'sent') {
          digestsSent += 1;
        } else if (outcome === 'skipped_no_email') {
          skippedNoEmail += 1;
          errors.push(
            `Developer @${digest.githubLogin}: no email on file — sign in to CodePulse with GitHub (user:email scope)`,
          );
        } else {
          skippedOptOut += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`Developer @${digest.githubLogin}: ${message}`);
        logger.error('Failed to process developer digest', {
          organizationId,
          developerLogin: digest.githubLogin,
          error: message,
        });
      }
    }

    return {
      digestsSent,
      developerCount: digests.length,
      skippedNoEmail,
      skippedOptOut,
      errors,
    };
  }

  private async processDeveloperDigest(
    digest: DeveloperDigest,
    organizationId: string,
    weekStart: Date,
    weekEnd: Date,
  ): Promise<DeveloperDigestOutcome> {
    const recipient = await resolveDigestRecipient(digest.githubLogin);
    if (!recipient) {
      logger.warn('Digest skipped: no recipient email', {
        developerLogin: digest.githubLogin,
        organizationId,
      });
      return 'skipped_no_email';
    }

    if (!recipient.digestEmailEnabled) {
      logger.info('Digest skipped: email disabled by user', {
        developerLogin: digest.githubLogin,
        organizationId,
      });
      return 'skipped_opt_out';
    }

    const subject = generateDigestSubject(digest);
    const html = generateDigestEmail(digest);

    await resendService.sendDigestEmail({
      to: recipient.email,
      subject,
      html,
      developerLogin: digest.githubLogin,
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

    logger.info('Digest sent and logged', {
      developerLogin: digest.githubLogin,
      email: recipient.email,
      totalIssues: digest.totalIssues,
      organizationId,
    });

    return 'sent';
  }
}

export const digestService = new DigestService();
