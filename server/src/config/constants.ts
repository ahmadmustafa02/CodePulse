/** Named constants for server config, limits, HTTP semantics, and GitHub webhooks. */

export const JSON_BODY_LIMIT = '10mb';

export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const RATE_LIMIT_MAX_REQUESTS = 100;

export const HTTP_STATUS_BAD_REQUEST = 400;
export const HTTP_STATUS_OK = 200;
export const HTTP_STATUS_NOT_FOUND = 404;
export const HTTP_STATUS_UNAUTHORIZED = 401;
export const HTTP_STATUS_ACCEPTED = 202;
export const HTTP_STATUS_NOT_IMPLEMENTED = 501;
export const HTTP_STATUS_UNPROCESSABLE_ENTITY = 422;
export const HTTP_STATUS_INTERNAL_SERVER_ERROR = 500;

export const ERROR_CODE_VALIDATION = 'VALIDATION_ERROR';
export const ERROR_CODE_INTERNAL = 'INTERNAL_ERROR';
export const ERROR_CODE_NOT_IMPLEMENTED = 'NOT_IMPLEMENTED';
export const ERROR_CODE_MISSING_SIGNATURE = 'MISSING_SIGNATURE';
export const ERROR_CODE_INVALID_SIGNATURE = 'INVALID_SIGNATURE';
export const ERROR_CODE_MISSING_EVENT_HEADER = 'MISSING_EVENT_HEADER';
export const ERROR_CODE_MISSING_DELIVERY_HEADER = 'MISSING_DELIVERY_HEADER';

export const API_PREFIX = '/api/v1';

export const SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const;

export const GITHUB_SIGNATURE_HEADER = 'x-hub-signature-256';
export const GITHUB_EVENT_HEADER = 'x-github-event';
export const GITHUB_DELIVERY_HEADER = 'x-github-delivery';
export const SIGNATURE_PREFIX = 'sha256=';

export const WEBHOOK_TIMEOUT_MS = 10000;
export const SUPPORTED_EVENTS = ['pull_request'] as const;
export const PR_ACTIONS_TO_PROCESS = ['opened', 'synchronize', 'reopened'] as const;

export const GITHUB_WEBHOOK_ROUTE = '/github';
export const GITHUB_WEBHOOK_SIMULATE_ROUTE = '/github/simulate';

export const SIMULATE_DEFAULT_REPO_OWNER = 'ahmadmustafa02';
export const SIMULATE_DEFAULT_REPO_NAME = 'CodePulse';
export const SIMULATE_DEFAULT_DEVELOPER_NAME = 'antigravity-simulator';
export const SIMULATE_DEFAULT_PR_NUMBER = 9001;
export const SIMULATE_DEFAULT_CHANGED_FILES = ['src/auth/login.ts'] as const;

export const SIMULATE_DEFAULT_DIFF_CONTENT = `diff --git a/src/auth/login.ts b/src/auth/login.ts
index 1111111..2222222 100644
--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -1,4 +1,5 @@
 export async function login(username: string, password: string) {
+  const apiToken = "sk-live-antigravity-demo-exposed-secret-token";
  const query = "SELECT * FROM users WHERE name = '" + username + "' AND pass = '" + password + "'";
  return fetch("/api/login", { headers: { Authorization: \`Bearer \${apiToken}\` } });
 }
`;

export const JWT_ALGORITHM = 'RS256';
export const JWT_CLOCK_SKEW_SECONDS = 60;
export const JWT_EXPIRY_MINUTES = 9;
export const JWT_EXPIRY_SECONDS = JWT_EXPIRY_MINUTES * 60;

export const DEV_NULL_PATH = '/dev/null';

export const GITHUB_DIFF_MEDIA_FORMAT = 'diff';

export const GROQ_MODEL = 'llama-3.3-70b-versatile';
export const GROQ_MAX_COMPLETION_TOKENS = 4096;
export const MAX_DIFF_TOKENS = 6000;
export const MAX_DIFF_CHAR_LIMIT = MAX_DIFF_TOKENS * 4;
export const MAX_DIFF_CHUNK_CHAR_LIMIT = 20000;
export const MAX_ISSUES_PER_PR = 20;
export const TRIAGE_MAX_FILES = 10;
export const TRIAGE_MAX_COMPLETION_TOKENS = 500;
export const MAX_FILE_SIZE_LINES = 500;
export const SKIPPABLE_FILE_PATTERNS = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '*.min.js',
  '*.min.css',
  'dist/',
  'build/',
  '.next/',
  'coverage/',
] as const;

export const GITHUB_REVIEW_EVENT_COMMENT = 'COMMENT';
export const GITHUB_REVIEW_SIDE_RIGHT = 'RIGHT';

export const GROQ_TOOL_NAME = 'report_code_issues';
export const CHARS_PER_ESTIMATED_TOKEN = 4;

export const DIGEST_SECRET_HEADER = 'x-digest-secret';
export const ERROR_CODE_INVALID_DIGEST_SECRET = 'INVALID_DIGEST_SECRET';
export const DIGEST_WEEK_DAYS = 7;
export const DIGEST_TOP_FILES_LIMIT = 3;

export const DIGEST_TRIGGER_ROUTE = '/trigger';
export const DIGEST_HEALTH_ROUTE = '/health';
export const DIGEST_PREFERENCES_ROUTE = '/preferences';
