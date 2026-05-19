/** Repository details and agent trace API routes. */

import { Router } from 'express';
import {
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_NOT_FOUND,
  HTTP_STATUS_OK,
  HTTP_STATUS_UNAUTHORIZED,
} from '../config/constants';
import { getOrganizationIdByInstallationId } from '../services/statsService';
import {
  findRepositoryBySlug,
  getAgentTraces,
  getRepositoryDetails,
} from '../services/repositoryService';
import { getUserFromRequest } from '../services/sessionService';
import logger from '../utils/logger';

export const reposRouter = Router();

async function resolveOrganizationId(
  req: import('express').Request,
  res: import('express').Response,
): Promise<string | null> {
  const session = getUserFromRequest(req);
  if (!session) {
    res.status(HTTP_STATUS_UNAUTHORIZED).json({
      success: false,
      message: 'Sign in required',
    });
    return null;
  }

  if (session.installationId === null) {
    res.status(HTTP_STATUS_OK).json({ success: true, data: null });
    return null;
  }

  const organizationId = await getOrganizationIdByInstallationId(session.installationId);
  if (!organizationId) {
    res.status(HTTP_STATUS_OK).json({ success: true, data: null });
    return null;
  }

  return organizationId;
}

function parsePrNumberQuery(value: unknown): number | undefined | 'invalid' {
  if (value === undefined || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 'invalid';
  }
  return parsed;
}

reposRouter.get('/repos/:owner/:repo', async (req, res, next) => {
  try {
    const organizationId = await resolveOrganizationId(req, res);
    if (organizationId === null) {
      return;
    }

    const { owner, repo } = req.params;
    const data = await getRepositoryDetails(organizationId, owner, repo);

    if (!data) {
      res.status(HTTP_STATUS_NOT_FOUND).json({
        success: false,
        message: `Repository ${owner}/${repo} not found`,
      });
      return;
    }

    res.status(HTTP_STATUS_OK).json({ success: true, data });
  } catch (error) {
    logger.error('Repository details route failed', {
      owner: req.params.owner,
      repo: req.params.repo,
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
});

reposRouter.get('/repos/:owner/:repo/traces', async (req, res, next) => {
  try {
    const organizationId = await resolveOrganizationId(req, res);
    if (organizationId === null) {
      return;
    }

    const prNumber = parsePrNumberQuery(req.query.prNumber);
    if (prNumber === 'invalid') {
      res.status(HTTP_STATUS_BAD_REQUEST).json({
        success: false,
        message: 'prNumber must be a positive integer',
      });
      return;
    }

    const { owner, repo } = req.params;
    const repository = await findRepositoryBySlug(organizationId, owner, repo);

    if (!repository) {
      res.status(HTTP_STATUS_NOT_FOUND).json({
        success: false,
        message: `Repository ${owner}/${repo} not found`,
      });
      return;
    }

    const data = await getAgentTraces(repository.id, prNumber);
    res.status(HTTP_STATUS_OK).json({ success: true, data });
  } catch (error) {
    logger.error('Repository traces route failed', {
      owner: req.params.owner,
      repo: req.params.repo,
      prNumber: req.query.prNumber,
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
});
