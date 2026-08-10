/** GitHub OAuth login and GitHub App installation callback routes. */

import { Router } from 'express';
import { HTTP_STATUS_OK } from '../config/constants';
import { env } from '../config/env';
import { databaseService } from '../services/databaseService';
import {
  assertUserCanLinkInstallation,
  InstallationAccessError,
} from '../services/installationAccessService';
import { syncInstallationRepositories } from '../services/installationSyncService';
import {
  buildGitHubAuthorizeUrl,
  buildLinkInstallationAuthorizeUrl,
  exchangeCodeForProfileAndToken,
  parseLinkInstallationState,
} from '../services/oauthService';
import {
  clearUserSessionCookie,
  getUserFromRequest,
  setUserSessionCookie,
} from '../services/sessionService';
import type { UserSession } from '../types/session';
import logger from '../utils/logger';

export const authRouter = Router();

function toUserSession(user: {
  githubLogin: string;
  avatarUrl: string | null;
  githubUserId: bigint;
  installationId: number | null;
}): UserSession {
  return {
    githubLogin: user.githubLogin,
    avatarUrl: user.avatarUrl,
    githubUserId: user.githubUserId.toString(),
    installationId: user.installationId,
  };
}

function redirectInstallFailed(res: import('express').Response, toRoot = false): void {
  const path = toRoot ? '/' : '/dashboard';
  res.redirect(`${env.WEB_APP_URL}${path}?error=install_failed`);
}

async function linkInstallationForUser(params: {
  githubUserId: bigint;
  githubLogin: string;
  installationId: number;
  userAccessToken?: string;
}): Promise<ReturnType<typeof databaseService.updateUserInstallationId>> {
  await assertUserCanLinkInstallation({
    githubUserId: params.githubUserId,
    githubLogin: params.githubLogin,
    installationId: params.installationId,
    userAccessToken: params.userAccessToken,
  });

  const user = await databaseService.updateUserInstallationId(
    params.githubUserId,
    params.installationId,
  );
  await syncInstallationRepositories(params.installationId);
  return user;
}

authRouter.get('/github', (_req, res) => {
  res.redirect(buildGitHubAuthorizeUrl());
});

authRouter.get('/github/callback', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  if (!code) {
    logger.warn('GitHub OAuth callback missing code');
    res.redirect(`${env.WEB_APP_URL}/?error=oauth_failed`);
    return;
  }

  const stateRaw = typeof req.query.state === 'string' ? req.query.state : null;
  const linkState = stateRaw ? parseLinkInstallationState(stateRaw) : null;

  try {
    const { profile, accessToken } = await exchangeCodeForProfileAndToken(code);
    const user = await databaseService.upsertUser({
      githubLogin: profile.githubLogin,
      githubUserId: profile.githubUserId,
      avatarUrl: profile.avatarUrl,
      email: profile.email,
    });

    if (linkState) {
      if (profile.githubUserId.toString() !== linkState.githubUserId) {
        logger.warn('Installation link OAuth: GitHub user mismatch with signed state', {
          installationId: linkState.installationId,
        });
        redirectInstallFailed(res);
        return;
      }

      try {
        const linked = await linkInstallationForUser({
          githubUserId: profile.githubUserId,
          githubLogin: profile.githubLogin,
          installationId: linkState.installationId,
          userAccessToken: accessToken,
        });
        setUserSessionCookie(res, toUserSession(linked));
        logger.info('Installation linked to user after OAuth verification', {
          githubLogin: linked.githubLogin,
          installationId: linkState.installationId,
        });
        res.redirect(`${env.WEB_APP_URL}/dashboard`);
        return;
      } catch (error) {
        if (error instanceof InstallationAccessError) {
          logger.warn('Installation link denied after OAuth verification', {
            installationId: linkState.installationId,
            reason: error.reason,
          });
        } else {
          logger.error('Failed to link installation after OAuth verification', {
            installationId: linkState.installationId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        redirectInstallFailed(res);
        return;
      }
    }

    setUserSessionCookie(res, toUserSession(user));
    logger.info('GitHub OAuth login succeeded', { githubLogin: user.githubLogin });
    res.redirect(`${env.WEB_APP_URL}/dashboard`);
  } catch (error) {
    logger.error('GitHub OAuth callback failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.redirect(`${env.WEB_APP_URL}/?error=oauth_failed`);
  }
});

authRouter.get('/installation/callback', async (req, res) => {
  const session = getUserFromRequest(req);
  if (!session) {
    logger.warn('Installation callback without logged-in user');
    redirectInstallFailed(res, true);
    return;
  }

  const raw = req.query.installation_id;
  const installationId =
    typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN;

  if (!Number.isFinite(installationId) || installationId <= 0) {
    logger.warn('Installation callback missing or invalid installation_id', { raw });
    redirectInstallFailed(res);
    return;
  }

  const githubUserId = BigInt(session.githubUserId);

  try {
    const user = await linkInstallationForUser({
      githubUserId,
      githubLogin: session.githubLogin,
      installationId,
    });

    setUserSessionCookie(res, toUserSession(user));
    logger.info('Installation linked to user', {
      githubLogin: user.githubLogin,
      installationId,
    });
    res.redirect(`${env.WEB_APP_URL}/dashboard`);
  } catch (error) {
    if (error instanceof InstallationAccessError && error.reason === 'needs_oauth') {
      logger.info('Organization installation requires OAuth membership verification', {
        installationId,
        githubUserId: session.githubUserId,
      });
      res.redirect(
        buildLinkInstallationAuthorizeUrl({
          installationId,
          githubUserId: session.githubUserId,
        }),
      );
      return;
    }

    if (error instanceof InstallationAccessError) {
      logger.warn('Installation link denied', {
        installationId,
        reason: error.reason,
        githubUserId: session.githubUserId,
      });
      redirectInstallFailed(res);
      return;
    }

    logger.error('Failed to link installation to user', {
      installationId,
      error: error instanceof Error ? error.message : String(error),
    });
    redirectInstallFailed(res);
  }
});

authRouter.get('/session', (req, res) => {
  const session = getUserFromRequest(req);
  if (!session) {
    res.status(HTTP_STATUS_OK).json({ success: true, data: null });
    return;
  }

  res.status(HTTP_STATUS_OK).json({
    success: true,
    data: {
      githubLogin: session.githubLogin,
      avatarUrl: session.avatarUrl,
      installationId: session.installationId,
    },
  });
});

authRouter.post('/logout', (_req, res) => {
  clearUserSessionCookie(res);
  res.status(HTTP_STATUS_OK).json({ success: true, data: null });
});
