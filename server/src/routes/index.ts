/** Central API router mounting versioned sub-routes. */

import { Router } from 'express';
import { healthRouter } from './health';
import { webhooksRouter } from './webhooks';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/webhooks', webhooksRouter);
