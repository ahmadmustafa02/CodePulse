/** Verifies that a GitHub user is allowed to link a GitHub App installation. */

import { githubAuthService } from './githubAuthService';
import { isActiveOrgMember } from './oauthService';
import logger from '../utils/logger';

export type InstallationAccessDenialReason = 'forbidden' | 'needs_oauth' | 'not_found';

export class InstallationAccessError extends Error {
  readonly reason: InstallationAccessDenialReason;

  constructor(reason: InstallationAccessDenialReason, message: string) {
    super(message);
    this.name = 'InstallationAccessError';
    this.reason = reason;
  }
}

/**
 * Ensures the authenticated GitHub user may link `installationId` to their CodePulse account.
 *
 * - User installations: account id must match the signed-in GitHub user (App JWT lookup).
 * - Organization installations: caller must supply a user OAuth token with `read:org`,
 *   and the user must be an active member of that org.
 *
 * Does not trust a client-supplied installation id alone.
 */
export async function assertUserCanLinkInstallation(params: {
  githubUserId: bigint;
  githubLogin: string;
  installationId: number;
  userAccessToken?: string;
}): Promise<void> {
  const { githubUserId, githubLogin, installationId, userAccessToken } = params;

  let target: Awaited<ReturnType<typeof githubAuthService.getInstallationTarget>>;
  try {
    target = await githubAuthService.getInstallationTarget(installationId);
  } catch (error) {
    logger.warn('Installation access check: installation not found for this App', {
      installationId,
      githubUserId: githubUserId.toString(),
      error: error instanceof Error ? error.message : String(error),
    });
    throw new InstallationAccessError('not_found', 'Installation not found');
  }

  if (target.targetType === 'User') {
    if (BigInt(target.accountId) !== githubUserId) {
      logger.warn('Installation access check: user installation ownership mismatch', {
        installationId,
        githubUserId: githubUserId.toString(),
      });
      throw new InstallationAccessError('forbidden', 'Not authorized to link this installation');
    }
    return;
  }

  if (target.targetType === 'Organization') {
    if (!userAccessToken) {
      throw new InstallationAccessError(
        'needs_oauth',
        'Organization installation requires OAuth verification',
      );
    }

    const isMember = await isActiveOrgMember(userAccessToken, target.accountLogin);
    if (!isMember) {
      logger.warn('Installation access check: org membership denied', {
        installationId,
        githubUserId: githubUserId.toString(),
        githubLogin,
      });
      throw new InstallationAccessError('forbidden', 'Not authorized to link this installation');
    }
    return;
  }

  logger.warn('Installation access check: unsupported target type', {
    installationId,
    targetType: target.targetType,
  });
  throw new InstallationAccessError('forbidden', 'Not authorized to link this installation');
}
