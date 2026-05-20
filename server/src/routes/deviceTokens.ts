/** Device access tokens for Capacitor / mobile clients (bearer auth). */

import { Router } from 'express';
import { z } from 'zod';
import {
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_NOT_FOUND,
  HTTP_STATUS_NO_CONTENT,
  HTTP_STATUS_OK,
  HTTP_STATUS_TOO_MANY_REQUESTS,
  HTTP_STATUS_UNAUTHORIZED,
} from '../config/constants';
import {
  generateDeviceToken,
  listDeviceTokens,
  revokeDeviceToken,
} from '../services/deviceTokenService';
import { prisma } from '../services/prismaService';
import {
  getUserFromRequest,
  getUserSessionFromCookie,
  ensureBearerNotInvalid,
} from '../services/sessionService';
import { getOrganizationIdByInstallationId } from '../services/statsService';
import type { UserSession } from '../types/session';
import logger from '../utils/logger';

export const deviceTokensRouter = Router();

const createBodySchema = z.object({
  name: z.string().min(1).max(200),
});

const CREATE_WINDOW_MS = 60 * 60 * 1000;
const CREATE_MAX_PER_WINDOW = 10;
const createTokenTimestamps = new Map<string, number[]>();

function tryConsumeCreateSlot(internalUserId: string): boolean {
  const now = Date.now();
  const windowStart = now - CREATE_WINDOW_MS;
  const stamps = (createTokenTimestamps.get(internalUserId) ?? []).filter((t) => t > windowStart);
  if (stamps.length >= CREATE_MAX_PER_WINDOW) {
    return false;
  }
  stamps.push(now);
  createTokenTimestamps.set(internalUserId, stamps);
  return true;
}

async function resolveDbUserId(session: UserSession): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { githubUserId: BigInt(session.githubUserId) },
    select: { id: true },
  });
  return user?.id ?? null;
}

deviceTokensRouter.post('/device-tokens', async (req, res, next) => {
  try {
    const cookieSession = getUserSessionFromCookie(req);
    if (!cookieSession) {
      res.status(HTTP_STATUS_UNAUTHORIZED).json({
        success: false,
        message: 'Sign in on the web with cookies to create device tokens',
      });
      return;
    }

    const parsed = createBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(HTTP_STATUS_BAD_REQUEST).json({
        success: false,
        error: {
          message: parsed.error.issues.map((i) => i.message).join('; '),
          code: 'VALIDATION_ERROR',
        },
      });
      return;
    }

    const userId = await resolveDbUserId(cookieSession);
    if (!userId) {
      res.status(HTTP_STATUS_UNAUTHORIZED).json({ success: false, message: 'User not found' });
      return;
    }

    if (!tryConsumeCreateSlot(userId)) {
      res.status(HTTP_STATUS_TOO_MANY_REQUESTS).json({
        success: false,
        message: 'Device token creation limit reached (10 per hour). Try again later.',
      });
      return;
    }

    const created = await generateDeviceToken(userId, parsed.data.name);
    res.status(HTTP_STATUS_OK).json({
      success: true,
      data: {
        id: created.id,
        name: created.name,
        token: created.token,
        createdAt: created.createdAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error('POST device-tokens failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
});

deviceTokensRouter.get('/device-tokens', async (req, res, next) => {
  try {
    const auth = await getUserFromRequest(req);
    if (!ensureBearerNotInvalid(auth, res)) return;
    if (auth.type === 'none') {
      res.status(HTTP_STATUS_UNAUTHORIZED).json({ success: false, message: 'Sign in required' });
      return;
    }

    const userId = await resolveDbUserId(auth.session);
    if (!userId) {
      res.status(HTTP_STATUS_UNAUTHORIZED).json({ success: false, message: 'User not found' });
      return;
    }

    const tokens = await listDeviceTokens(userId);
    res.status(HTTP_STATUS_OK).json({
      success: true,
      data: {
        tokens: tokens.map((t) => ({
          id: t.id,
          name: t.name,
          createdAt: t.createdAt.toISOString(),
          lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
          revokedAt: t.revokedAt?.toISOString() ?? null,
        })),
      },
    });
  } catch (error) {
    logger.error('GET device-tokens failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
});

deviceTokensRouter.delete('/device-tokens/:id', async (req, res, next) => {
  try {
    const auth = await getUserFromRequest(req);
    if (!ensureBearerNotInvalid(auth, res)) return;
    if (auth.type === 'none') {
      res.status(HTTP_STATUS_UNAUTHORIZED).json({ success: false, message: 'Sign in required' });
      return;
    }

    const tokenId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!tokenId) {
      res.status(HTTP_STATUS_BAD_REQUEST).json({ success: false, message: 'Invalid token id' });
      return;
    }

    const userId = await resolveDbUserId(auth.session);
    if (!userId) {
      res.status(HTTP_STATUS_UNAUTHORIZED).json({ success: false, message: 'User not found' });
      return;
    }

    const revoked = await revokeDeviceToken(userId, tokenId);
    if (!revoked) {
      res.status(HTTP_STATUS_NOT_FOUND).json({ success: false, message: 'Token not found' });
      return;
    }

    res.status(HTTP_STATUS_NO_CONTENT).end();
  } catch (error) {
    logger.error('DELETE device-tokens failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
});

deviceTokensRouter.get('/me', async (req, res, next) => {
  try {
    const auth = await getUserFromRequest(req);
    if (!ensureBearerNotInvalid(auth, res)) return;
    if (auth.type === 'none') {
      res.status(HTTP_STATUS_UNAUTHORIZED).json({ success: false, message: 'Sign in required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { githubUserId: BigInt(auth.session.githubUserId) },
    });
    if (!user) {
      res.status(HTTP_STATUS_UNAUTHORIZED).json({ success: false, message: 'User not found' });
      return;
    }

    let organization: {
      id: string;
      name: string;
      githubInstallationId: number;
    } | null = null;

    if (user.installationId !== null) {
      const org = await prisma.organization.findUnique({
        where: { githubInstallationId: user.installationId },
        select: { id: true, name: true, githubInstallationId: true },
      });
      if (org) {
        organization = org;
      } else {
        const orgId = await getOrganizationIdByInstallationId(user.installationId);
        if (orgId) {
          const orgRow = await prisma.organization.findUnique({
            where: { id: orgId },
            select: { id: true, name: true, githubInstallationId: true },
          });
          organization = orgRow;
        }
      }
    }

    res.status(HTTP_STATUS_OK).json({
      success: true,
      data: {
        user: {
          id: user.id,
          githubLogin: user.githubLogin,
          githubUserId: user.githubUserId.toString(),
          avatarUrl: user.avatarUrl,
          email: user.email,
          digestEmailEnabled: user.digestEmailEnabled,
          installationId: user.installationId,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        },
        organization,
      },
    });
  } catch (error) {
    logger.error('GET me failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
});
