/** Secures digest trigger endpoints with a shared cron secret header. */

import type { NextFunction, Request, Response } from 'express';
import {
  DIGEST_SECRET_HEADER,
  ERROR_CODE_INVALID_DIGEST_SECRET,
  HTTP_STATUS_UNAUTHORIZED,
} from '../config/constants';
import { env } from '../config/env';
import { getHeaderValue } from '../utils/headers';

type ErrorBody = {
  success: false;
  error: { message: string; code: string };
};

export function verifyDigestSecret(req: Request, res: Response, next: NextFunction): void {
  try {
    const providedSecret = getHeaderValue(req.headers, DIGEST_SECRET_HEADER);

    if (!providedSecret || providedSecret !== env.DIGEST_CRON_SECRET) {
      const body: ErrorBody = {
        success: false,
        error: { message: 'Unauthorized', code: ERROR_CODE_INVALID_DIGEST_SECRET },
      };
      res.status(HTTP_STATUS_UNAUTHORIZED).json(body);
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}
