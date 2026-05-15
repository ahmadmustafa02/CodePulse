/** Express application bootstrap, middleware wiring, and graceful HTTP shutdown. */

import { env } from './config/env';
import { createServer } from 'http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import {
  API_PREFIX,
  JSON_BODY_LIMIT,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
  SHUTDOWN_SIGNALS,
} from './config/constants';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { apiRouter } from './routes/index';
import logger from './utils/logger';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(
  rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.use(requestLogger);
app.use(API_PREFIX, apiRouter);
app.use(errorHandler);

const server = createServer(app);

function shutdown(signal: string): void {
  logger.info('Shutdown signal received; closing HTTP server', { signal });
  server.close((closeErr) => {
    if (closeErr) {
      logger.error('Error while closing HTTP server', {
        message: closeErr.message,
        stack: closeErr.stack,
      });
      process.exit(1);
      return;
    }
    logger.info('HTTP server closed cleanly');
    process.exit(0);
  });
}

for (const signal of SHUTDOWN_SIGNALS) {
  process.on(signal, () => {
    shutdown(signal);
  });
}

server.listen(env.PORT, () => {
  logger.info('Server listening', { port: env.PORT, environment: env.NODE_ENV });
});

export default app;
