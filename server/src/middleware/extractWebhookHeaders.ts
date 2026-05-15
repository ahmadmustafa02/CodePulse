/** Extracts and validates GitHub webhook event and delivery headers into res.locals. */

import type { NextFunction, Request, Response } from 'express';
import {
  ERROR_CODE_MISSING_DELIVERY_HEADER,
  ERROR_CODE_MISSING_EVENT_HEADER,
  GITHUB_DELIVERY_HEADER,
  GITHUB_EVENT_HEADER,
  HTTP_STATUS_BAD_REQUEST,
} from '../config/constants';
import { getHeaderValue } from '../utils/headers';
import logger from '../utils/logger';

type ErrorBody = {
  success: false;
  error: { message: string; code: string };
};

function respondMissingHeader(res: Response, message: string, code: string): void {
  const body: ErrorBody = { success: false, error: { message, code } };
  res.status(HTTP_STATUS_BAD_REQUEST).json(body);
}

export function extractWebhookHeaders(req: Request, res: Response, next: NextFunction): void {
  try {
    const eventType = getHeaderValue(req.headers, GITHUB_EVENT_HEADER);
    if (!eventType) {
      logger.warn('GitHub webhook missing event header', { header: GITHUB_EVENT_HEADER });
      respondMissingHeader(res, 'Missing GitHub event header', ERROR_CODE_MISSING_EVENT_HEADER);
      return;
    }

    const deliveryId = getHeaderValue(req.headers, GITHUB_DELIVERY_HEADER);
    if (!deliveryId) {
      logger.warn('GitHub webhook missing delivery header', { header: GITHUB_DELIVERY_HEADER });
      respondMissingHeader(res, 'Missing GitHub delivery header', ERROR_CODE_MISSING_DELIVERY_HEADER);
      return;
    }

    res.locals.eventType = eventType;
    res.locals.deliveryId = deliveryId;
    next();
  } catch (error) {
    next(error);
  }
}
