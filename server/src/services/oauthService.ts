/** GitHub OAuth: authorize URL and code exchange for user identity. */

import { env } from '../config/env';

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';

export type GitHubOAuthProfile = {
  githubLogin: string;
  githubUserId: bigint;
  avatarUrl: string | null;
  email: string | null;
};

export function buildGitHubAuthorizeUrl(): string {
  const params = new URLSearchParams({
    client_id: env.GITHUB_OAUTH_CLIENT_ID,
    redirect_uri: env.GITHUB_OAUTH_CALLBACK_URL,
    scope: 'read:user user:email',
  });
  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCodeForProfile(code: string): Promise<GitHubOAuthProfile> {
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

  const userRes = await fetch(GITHUB_USER_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${tokenJson.access_token}`,
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

  return {
    githubLogin: user.login,
    githubUserId: BigInt(user.id),
    avatarUrl: user.avatar_url ?? null,
    email: user.email ?? null,
  };
}
