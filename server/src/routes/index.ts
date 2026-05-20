/** Central API router mounting versioned sub-routes with selective body parsers. */

import express, { Router } from 'express';
import { JSON_BODY_LIMIT } from '../config/constants';
import { antigravityFeedRouter } from './antigravityFeed';
import { authRouter } from './auth';
import { digestRouter } from './digest';
import { healthRouter } from './health';
import { proposedFixesRouter } from './proposedFixes';
import { repositorySettingsRouter } from './repositorySettings';
import { statsRouter } from './stats';
import { tracesRouter } from './traces';
import { webhooksRouter } from './webhooks';

export const apiRouter = Router();

const jsonParser = express.json({ limit: JSON_BODY_LIMIT });

// Register webhooks before any express.json() on this router so the body stays a raw Buffer.
apiRouter.use('/webhooks', webhooksRouter);

apiRouter.use('/health', jsonParser, healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/digest', jsonParser, digestRouter);
apiRouter.use('/antigravity', antigravityFeedRouter);
apiRouter.use('/traces', jsonParser, tracesRouter);
apiRouter.use('/proposed-code-fixes', jsonParser, proposedFixesRouter);
apiRouter.use('/repository-settings', repositorySettingsRouter);
apiRouter.use(statsRouter);
