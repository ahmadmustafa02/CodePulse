/** GitHub OAuth: authorize URL and code exchange for user identity. */

import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import logger from '../utils/logger';

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const GITHUB_USER_EMAILS_URL = 'https://api.github.com/user/emails';
const GITHUB_USER_ORG_MEMBERSHIP_URL = 'https://api.github.com/user/memberships/orgs';

const DEFAULT_OAUTH_SCOPES = ['read:user', 'user:email'] as const;
const LINK_INSTALLATION_OAUTH_SCOPES = ['read:user', 'user:email', 'read:org'] as const;
const LINK_INSTALLATION_STATE_PURPOSE = 'link_installation' as const;
const LINK_INSTALLATION_STATE_TTL = '10m';

export type GitHubOAuthProfile = {
  githubLogin: string;
  githubUserId: bigint;
  avatarUrl: string | null;
  email: string | null;
};

export type LinkInstallationOAuthState = {
  purpose: typeof LINK_INSTALLATION_STATE_PURPOSE;
  installationId: number;
  githubUserId: string;
};

export function buildGitHubAuthorizeUrl(options?: {
  state?: string;
  scopes?: readonly string[];
}): string {
  const params = new URLSearchParams({
    client_id: env.GITHUB_OAUTH_CLIENT_ID,
    redirect_uri: env.GITHUB_OAUTH_CALLBACK_URL,
    scope: (options?.scopes ?? DEFAULT_OAUTH_SCOPES).join(' '),
  });
  if (options?.state) {
    params.set('state', options.state);
  }
  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
}

export function buildLinkInstallationAuthorizeUrl(params: {
  installationId: number;
  githubUserId: string;
}): string {
  const state = signLinkInstallationState({
    installationId: params.installationId,
    githubUserId: params.githubUserId,
  });
  return buildGitHubAuthorizeUrl({
    state,
    scopes: LINK_INSTALLATION_OAUTH_SCOPES,
  });
}

export function signLinkInstallationState(params: {
  installationId: number;
  githubUserId: string;
}): string {
  const payload: LinkInstallationOAuthState = {
    purpose: LINK_INSTALLATION_STATE_PURPOSE,
    installationId: params.installationId,
    githubUserId: params.githubUserId,
  };
  return jwt.sign(payload, env.AUTH_SECRET, { expiresIn: LINK_INSTALLATION_STATE_TTL });
}

export function parseLinkInstallationState(state: string): LinkInstallationOAuthState | null {
  try {
    const payload = jwt.verify(state, env.AUTH_SECRET) as jwt.JwtPayload;
    if (payload.purpose !== LINK_INSTALLATION_STATE_PURPOSE) {
      return null;
    }
    const installationId = Number(payload.installationId);
    const githubUserId =
      typeof payload.githubUserId === 'string' ? payload.githubUserId : null;
    if (
      !githubUserId ||
      !Number.isFinite(installationId) ||
      installationId <= 0 ||
      !/^\d+$/.test(githubUserId)
    ) {
      return null;
    }
    return {
      purpose: LINK_INSTALLATION_STATE_PURPOSE,
      installationId,
      githubUserId,
    };
  } catch {
    return null;
  }
}

type GitHubEmailEntry = {
  email: string;
  primary: boolean;
  verified: boolean;
};

async function fetchPrimaryEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(GITHUB_USER_EMAILS_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    logger.warn('GitHub user emails fetch failed', { status: res.status });
    return null;
  }

  const emails = (await res.json()) as GitHubEmailEntry[];
  const primaryVerified = emails.find((entry) => entry.primary && entry.verified);
  if (primaryVerified) {
    return primaryVerified.email;
  }

  const anyVerified = emails.find((entry) => entry.verified);
  if (anyVerified) {
    return anyVerified.email;
  }

  return emails[0]?.email ?? null;
}

/** Returns whether the token owner is an active member of `orgLogin`. Does not expose org details. */
export async function isActiveOrgMember(
  accessToken: string,
  orgLogin: string,
): Promise<boolean> {
  if (!orgLogin || orgLogin === 'unknown') {
    return false;
  }

  const res = await fetch(
    `${GITHUB_USER_ORG_MEMBERSHIP_URL}/${encodeURIComponent(orgLogin)}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (res.status === 404 || res.status === 403) {
    return false;
  }

  if (!res.ok) {
    logger.warn('GitHub org membership check failed', { status: res.status });
    return false;
  }

  const body = (await res.json()) as { state?: string };
  return body.state === 'active';
}

export async function exchangeCodeForProfileAndToken(code: string): Promise<{
  profile: GitHubOAuthProfile;
  accessToken: string;
}> {
  const tokenRes = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: env.GITHUB_OAUTH_CLIENT_ID,
      client_secret: env.GITHUB_OAUTH_CLIENT_SECRET,
      code,
    }),
  });

  if (!tokenRes.ok) {
    throw new Error(`GitHub token exchange failed: ${tokenRes.status}`);
  }

  const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenJson.access_token) {
    throw new Error(tokenJson.error ?? 'GitHub token exchange returned no access_token');
  }

  const accessToken = tokenJson.access_token;

  const userRes = await fetch(GITHUB_USER_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!userRes.ok) {
    throw new Error(`GitHub user fetch failed: ${userRes.status}`);
  }

  const user = (await userRes.json()) as {
    id: number;
    login: string;
    avatar_url?: string | null;
    email?: string | null;
  };

  let email = user.email?.trim() || null;
  if (!email) {
    email = await fetchPrimaryEmail(accessToken);
  }

  if (!email) {
    logger.warn('GitHub OAuth: no email returned from profile or /user/emails', {
      githubLogin: user.login,
    });
  }

  return {
    accessToken,
    profile: {
      githubLogin: user.login,
      githubUserId: BigInt(user.id),
      avatarUrl: user.avatar_url ?? null,
      email,
    },
  };
}

export async function exchangeCodeForProfile(code: string): Promise<GitHubOAuthProfile> {
  const { profile } = await exchangeCodeForProfileAndToken(code);
  return profile;
}
