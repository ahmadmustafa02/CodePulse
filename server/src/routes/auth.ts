/** GitHub OAuth login and GitHub App installation callback routes. */

import { Router } from 'express';
import { HTTP_STATUS_OK } from '../config/constants';
import { env } from '../config/env';
import { databaseService } from '../services/databaseService';
import { organizationLinkService } from '../services/organizationLinkService';
import { buildGitHubAuthorizeUrl, exchangeCodeForProfile } from '../services/oauthService';
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

  try {
    const profile = await exchangeCodeForProfile(code);
    const user = await databaseService.upsertUser({
      githubLogin: profile.githubLogin,
      githubUserId: profile.githubUserId,
      avatarUrl: profile.avatarUrl,
      email: profile.email,
    });

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
    res.redirect(`${env.WEB_APP_URL}/?error=install_failed`);
    return;
  }

  const raw = req.query.installation_id;
  const installationId =
    typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN;

  if (!Number.isFinite(installationId) || installationId <= 0) {
    logger.warn('Installation callback missing or invalid installation_id', { raw });
    res.redirect(`${env.WEB_APP_URL}/dashboard?error=install_failed`);
    return;
  }

  try {
    const githubUserId = BigInt(session.githubUserId);
    const user = await databaseService.updateUserInstallationId(githubUserId, installationId);
    await organizationLinkService.linkInstallationToOrganization(
      installationId,
      user.githubLogin,
    );

    setUserSessionCookie(res, toUserSession(user));
    logger.info('Installation linked to user', {
      githubLogin: user.githubLogin,
      installationId,
    });
  } catch (error) {
    logger.error('Failed to link installation to user', {
      installationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  res.redirect(`${env.WEB_APP_URL}/dashboard`);
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
