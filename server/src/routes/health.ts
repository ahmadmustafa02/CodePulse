/** GET /health - liveness payload for load balancers and ops. */

import { Router } from 'express';
import { env } from '../config/env';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: env.NODE_ENV,
    },
  });
});
