/** Placeholder GitHub webhooks router until webhook handlers are implemented. */

import { Router } from 'express';
import {
  ERROR_CODE_NOT_IMPLEMENTED,
  HTTP_STATUS_NOT_IMPLEMENTED,
} from '../config/constants';

export const webhooksRouter = Router();

webhooksRouter.all('*', (_req, res) => {
  res.status(HTTP_STATUS_NOT_IMPLEMENTED).json({
    success: false,
    error: {
      message: 'Webhooks are not implemented yet',
      code: ERROR_CODE_NOT_IMPLEMENTED,
    },
  });
});
