import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import { HTTP_STATUS_UNAUTHORIZED } from '../config/constants';
import { env } from '../config/env';
import type { UserSession, UserSessionPayload } from '../types/session';
import { verifyDeviceToken } from './deviceTokenService';

const COOKIE_NAME = 'codepulse_session';
const MAX_AGE_SEC = 60 * 60 * 24 * 30;

export function signUserSession(session: UserSession): string {
  return jwt.sign(session, env.AUTH_SECRET, { expiresIn: MAX_AGE_SEC });
}

export function verifyUserSession(token: string): UserSession | null {
  try {
    const payload = jwt.verify(token, env.AUTH_SECRET) as UserSessionPayload;
    if (typeof payload.githubLogin !== 'string' || !payload.githubLogin) return null;
    if (typeof payload.githubUserId !== 'string' || !payload.githubUserId) return null;
    const installationId =
      payload.installationId === null || payload.installationId === undefined
        ? null
        : Number(payload.installationId);
    if (installationId !== null && (!Number.isFinite(installationId) || installationId <= 0)) {
      return null;
    }
    return {
      githubLogin: payload.githubLogin,
      avatarUrl: typeof payload.avatarUrl === 'string' ? payload.avatarUrl : null,
      githubUserId: payload.githubUserId,
      installationId,
    };
  } catch {
    return null;
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((part) => {
      const [key, ...rest] = part.trim().split('=');
      return [key, decodeURIComponent(rest.join('='))];
    }),
  );
}

export type SessionResult =
  | { type: 'session'; session: UserSession }
  | { type: 'none' }
  | { type: 'bearer_invalid' };

export function ensureBearerNotInvalid(
  auth: SessionResult,
  res: Response,
): auth is { type: 'session'; session: UserSession } | { type: 'none' } {
  if (auth.type === 'bearer_invalid') {
    res.status(HTTP_STATUS_UNAUTHORIZED).json({
      success: false,
      message: 'Invalid or revoked access token',
    });
    return false;
  }
  return true;
}

export function getUserSessionFromCookie(req: Request): UserSession | null {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  return verifyUserSession(token);
}

export async function getUserFromRequest(req: Request): Promise<SessionResult> {
  const auth = req.headers.authorization;
  if (typeof auth === 'string') {
    const match = auth.match(/^Bearer\s+(.*)$/i);
    if (match) {
      const raw = match[1].trim();
      if (raw.startsWith('cpat_')) {
        const session = await verifyDeviceToken(raw);
        if (!session) {
          return { type: 'bearer_invalid' };
        }
        return { type: 'session', session };
      }
    }
  }

  const cookieSession = getUserSessionFromCookie(req);
  if (cookieSession) {
    return { type: 'session', session: cookieSession };
  }
  return { type: 'none' };
}

function sessionCookieHeader(token: string, maxAgeSec: number): string {
  return [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAgeSec}`,
    'SameSite=None',
    'Secure',
  ].join('; ');
}

export function setUserSessionCookie(res: Response, session: UserSession): void {
  const token = signUserSession(session);
  res.setHeader('Set-Cookie', sessionCookieHeader(token, MAX_AGE_SEC));
}

export function clearUserSessionCookie(res: Response): void {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0; SameSite=None; Secure`,
  );
}
