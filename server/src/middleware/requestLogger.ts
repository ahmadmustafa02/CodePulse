/** Express middleware: logs method, URL, status, and response time using Winston. */

import type { NextFunction, Request, Response } from 'express';
import logger from '../utils/logger';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    logger.http('request', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
    });
  });

  next();
}
