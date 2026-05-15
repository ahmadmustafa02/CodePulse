/** Verifies GitHub webhook HMAC-SHA256 signatures against the raw request body. */

import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import {
  ERROR_CODE_INVALID_SIGNATURE,
  ERROR_CODE_MISSING_SIGNATURE,
  GITHUB_SIGNATURE_HEADER,
  HTTP_STATUS_UNAUTHORIZED,
  SIGNATURE_PREFIX,
} from '../config/constants';
import { env } from '../config/env';
import type { PullRequestWebhookPayload } from '../types/github';
import { getHeaderValue } from '../utils/headers';
import logger from '../utils/logger';

type ErrorBody = {
  success: false;
  error: { message: string; code: string };
};

function respondUnauthorized(res: Response, message: string, code: string): void {
  const body: ErrorBody = { success: false, error: { message, code } };
  res.status(HTTP_STATUS_UNAUTHORIZED).json(body);
}

function isBufferBody(body: unknown): body is Buffer {
  return Buffer.isBuffer(body);
}

function signaturesMatch(expected: string, received: string): boolean {
  const expectedBuf = Buffer.from(expected, 'utf8');
  const receivedBuf = Buffer.from(received, 'utf8');
  if (expectedBuf.length !== receivedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

function computeExpectedSignature(rawBody: Buffer): string {
  const digest = crypto
    .createHmac('sha256', env.GITHUB_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return `${SIGNATURE_PREFIX}${digest}`;
}

export function verifyGitHubSignature(req: Request, res: Response, next: NextFunction): void {
  const deliveryId = res.locals.deliveryId ?? 'unknown';

  try {
    if (!isBufferBody(req.body)) {
      const error = new Error('Webhook body must be a raw Buffer for signature verification');
      next(error);
      return;
    }

    const rawBody = req.body;
    const signatureHeader = getHeaderValue(req.headers, GITHUB_SIGNATURE_HEADER);

    if (!signatureHeader) {
      logger.warn('GitHub webhook signature verification failed', {
        deliveryId,
        reason: 'missing_signature',
      });
      respondUnauthorized(res, 'Missing signature', ERROR_CODE_MISSING_SIGNATURE);
      return;
    }

    const expectedSignature = computeExpectedSignature(rawBody);
    const valid = signaturesMatch(expectedSignature, signatureHeader);

    if (!valid) {
      logger.warn('GitHub webhook signature verification failed', {
        deliveryId,
        reason: 'invalid_signature',
      });
      respondUnauthorized(res, 'Invalid signature', ERROR_CODE_INVALID_SIGNATURE);
      return;
    }

    const parsed = JSON.parse(rawBody.toString('utf8')) as PullRequestWebhookPayload;
    req.body = parsed;

    logger.info('GitHub webhook signature verified', { deliveryId });
    next();
  } catch (error) {
    next(error);
  }
}
