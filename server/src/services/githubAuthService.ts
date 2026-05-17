/** GitHub App JWT generation and installation access token exchange. */

import { Octokit } from '@octokit/rest';
import jwt from 'jsonwebtoken';
import { JWT_ALGORITHM, JWT_CLOCK_SKEW_SECONDS, JWT_EXPIRY_SECONDS } from '../config/constants';
import { env } from '../config/env';
import type { GitHubInstallationDetails } from '../types/githubInstallation';
import logger from '../utils/logger';

function normalizePrivateKey(key: string): string {
  return key.replace(/\\n/g, '\n');
}

export class GitHubAuthService {
  private appOctokit(): Octokit {
    return new Octokit({ auth: this.generateJWT() });
  }

  private generateJWT(): string {
    const privateKey = normalizePrivateKey(env.GITHUB_PRIVATE_KEY);
    const now = Math.floor(Date.now() / 1000);

    return jwt.sign(
      {
        iss: env.GITHUB_APP_ID,
        iat: now - JWT_CLOCK_SKEW_SECONDS,
        exp: now + JWT_EXPIRY_SECONDS,
      },
      privateKey,
      { algorithm: JWT_ALGORITHM },
    );
  }

  async getInstallationDetails(installationId: number): Promise<GitHubInstallationDetails> {
    try {
      const { data } = await this.appOctokit().rest.apps.getInstallation({
        installation_id: installationId,
      });

      const account = data.account;
      if (!account || !('login' in account) || typeof account.login !== 'string') {
        throw new Error(`Installation ${installationId} has no account login`);
      }

      return {
        id: data.id,
        account: {
          login: account.login,
          type: account.type ?? 'Unknown',
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error fetching installation';
      throw new Error(`Failed to get installation ${installationId}: ${message}`);
    }
  }

  async getInstallationToken(installationId: number): Promise<string> {
    try {
      const { data } = await this.appOctokit().rest.apps.createInstallationAccessToken({
        installation_id: installationId,
      });

      if (!data.token) {
        throw new Error(`GitHub returned no token for installation ${installationId}`);
      }

      logger.info('GitHub installation token obtained', { installationId });
      return data.token;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error exchanging installation token';
      throw new Error(
        `Failed to get installation access token for installation ${installationId}: ${message}`,
      );
    }
  }
}

export const githubAuthService = new GitHubAuthService();
