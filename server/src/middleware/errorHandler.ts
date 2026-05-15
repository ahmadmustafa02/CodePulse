/** Global Express error handler: structured JSON responses and safe production leakage rules. */

import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import {
  ERROR_CODE_INTERNAL,
  ERROR_CODE_VALIDATION,
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
} from '../config/constants';
import { env } from '../config/env';
import logger from '../utils/logger';

type ErrorBody = {
  success: false;
  error: { message: string; code: string };
};

function buildBody(message: string, code: string): ErrorBody {
  return { success: false, error: { message, code } };
}

function resolveZodResponse(err: ZodError): { status: number; body: ErrorBody } {
  const message = err.issues.map((issue) => issue.message).join('; ');
  return {
    status: HTTP_STATUS_BAD_REQUEST,
    body: buildBody(message, ERROR_CODE_VALIDATION),
  };
}

function resolveGenericResponse(err: unknown): { status: number; body: ErrorBody } {
  const isProduction = env.NODE_ENV === 'production';
  if (err instanceof Error) {
    const message = isProduction ? 'Internal server error' : err.message;
    return {
      status: HTTP_STATUS_INTERNAL_SERVER_ERROR,
      body: buildBody(message, ERROR_CODE_INTERNAL),
    };
  }
  const message = isProduction ? 'Internal server error' : 'An unexpected error occurred';
  return {
    status: HTTP_STATUS_INTERNAL_SERVER_ERROR,
    body: buildBody(message, ERROR_CODE_INTERNAL),
  };
}

function logPipelineError(err: unknown): void {
  if (err instanceof ZodError) {
    logger.error('Unhandled Zod error in request pipeline', { issues: err.issues });
    return;
  }
  if (err instanceof Error) {
    logger.error('Unhandled error in request pipeline', {
      message: err.message,
      stack: err.stack,
      name: err.name,
    });
    return;
  }
  logger.error('Unhandled non-Error in request pipeline', { detail: err });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) {
    return;
  }

  logPipelineError(err);

  const { status, body } =
    err instanceof ZodError ? resolveZodResponse(err) : resolveGenericResponse(err);

  res.status(status).json(body);
}
