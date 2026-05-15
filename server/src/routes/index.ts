/** Central API router mounting versioned sub-routes with selective body parsers. */

import express, { Router } from 'express';
import { JSON_BODY_LIMIT } from '../config/constants';
import { digestRouter } from './digest';
import { healthRouter } from './health';
import { webhooksRouter } from './webhooks';

export const apiRouter = Router();

apiRouter.use('/health', express.json({ limit: JSON_BODY_LIMIT }), healthRouter);
apiRouter.use('/digest', express.json({ limit: JSON_BODY_LIMIT }), digestRouter);
apiRouter.use('/webhooks', webhooksRouter);
