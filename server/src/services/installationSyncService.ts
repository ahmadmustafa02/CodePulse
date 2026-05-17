/** Syncs GitHub App installation repositories into the database after install or on demand. */

import { databaseService } from './databaseService';
import { githubAuthService } from './githubAuthService';
import logger from '../utils/logger';

export async function syncInstallationRepositories(installationId: number): Promise<number> {
  const accountLogin = await githubAuthService.getInstallationAccountLogin(installationId);
  const organization = await databaseService.ensureOrganizationForInstallation(
    installationId,
    accountLogin,
  );

  const repositories = await githubAuthService.listAccessibleRepositories(installationId);

  for (const repo of repositories) {
    await databaseService.upsertRepository({
      githubRepoId: repo.id,
      name: repo.name,
      fullName: repo.fullName,
      private: repo.private,
      organizationId: organization.id,
    });
  }

  logger.info('Installation repositories synced', {
    installationId,
    organizationId: organization.id,
    repositoryCount: repositories.length,
  });

  return repositories.length;
}
