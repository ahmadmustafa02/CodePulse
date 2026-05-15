/** Named constants for server config, limits, and HTTP semantics (no magic values in app code). */

export const JSON_BODY_LIMIT = '10mb';

export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const RATE_LIMIT_MAX_REQUESTS = 100;

export const HTTP_STATUS_BAD_REQUEST = 400;
export const HTTP_STATUS_NOT_IMPLEMENTED = 501;
export const HTTP_STATUS_INTERNAL_SERVER_ERROR = 500;

export const ERROR_CODE_VALIDATION = 'VALIDATION_ERROR';
export const ERROR_CODE_INTERNAL = 'INTERNAL_ERROR';
export const ERROR_CODE_NOT_IMPLEMENTED = 'NOT_IMPLEMENTED';

export const API_PREFIX = '/api/v1';

export const SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const;
