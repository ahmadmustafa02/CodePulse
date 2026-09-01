/**
 * Writes Phase 5 expanded eval diffs + merges into cases.json (idempotent by case id).
 * Run once from server/: npx ts-node eval/scripts/expandDataset.ts
 */

import fs from 'fs';
import path from 'path';

type Expected = {
  id: string;
  file: string;
  line: number;
  lineTolerance: number;
  category: string;
  severityMin?: string;
  keywords: string[];
};

type CaseDef = {
  id: string;
  language: string;
  prTitle: string;
  prDescription: string;
  diffPath: string;
  negative: boolean;
  expected: Expected[];
  diff: string;
};

const root = path.join(__dirname, '..', 'dataset');
const diffsDir = path.join(root, 'diffs');
const casesPath = path.join(root, 'cases.json');

const NEW_CASES: CaseDef[] = [
  {
    id: 'sec-path-traversal',
    language: 'typescript',
    prTitle: 'Serve user avatars from disk',
    prDescription: 'Read avatar files by name from uploads.',
    diffPath: 'diffs/sec-path-traversal.diff',
    negative: false,
    expected: [
      {
        id: 'traversal',
        file: 'src/files/avatar.ts',
        line: 8,
        lineTolerance: 2,
        category: 'security',
        severityMin: 'high',
        keywords: ['path', 'traversal', '..', 'join', 'unsanitiz'],
      },
    ],
    diff: `diff --git a/src/files/avatar.ts b/src/files/avatar.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/files/avatar.ts
@@ -0,0 +1,14 @@
+import fs from 'fs/promises';
+import path from 'path';
+
+const UPLOADS = '/var/app/uploads';
+
+export async function readAvatar(fileName: string) {
+  // User-controlled fileName is joined without sanitizing .. segments.
+  const target = path.join(UPLOADS, fileName);
+  return fs.readFile(target);
+}
+
+export function avatarUrl(id: string) {
+  return \`/avatars/\${id}.png\`;
+}
`,
  },
  {
    id: 'sec-ssrf',
    language: 'typescript',
    prTitle: 'Fetch remote preview images',
    prDescription: 'Proxy image URLs for the editor.',
    diffPath: 'diffs/sec-ssrf.diff',
    negative: false,
    expected: [
      {
        id: 'ssrf',
        file: 'src/http/preview.ts',
        line: 6,
        lineTolerance: 2,
        category: 'security',
        severityMin: 'high',
        keywords: ['ssrf', 'fetch', 'url', 'internal', 'untrusted'],
      },
    ],
    diff: `diff --git a/src/http/preview.ts b/src/http/preview.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/http/preview.ts
@@ -0,0 +1,12 @@
+export async function fetchPreview(imageUrl: string) {
+  // Forwards attacker-controlled URLs to the server-side fetch.
+  const response = await fetch(imageUrl);
+  if (!response.ok) {
+    throw new Error('preview failed');
+  }
+  return Buffer.from(await response.arrayBuffer());
+}
+
+export function isHttp(url: string) {
+  return url.startsWith('http://') || url.startsWith('https://');
+}
`,
  },
  {
    id: 'sec-insecure-random',
    language: 'typescript',
    prTitle: 'Generate password reset tokens',
    prDescription: 'Create reset tokens for email links.',
    diffPath: 'diffs/sec-insecure-random.diff',
    negative: false,
    expected: [
      {
        id: 'random',
        file: 'src/auth/resetToken.ts',
        line: 4,
        lineTolerance: 2,
        category: 'security',
        severityMin: 'high',
        keywords: ['random', 'math.random', 'predictable', 'token', 'crypto'],
      },
    ],
    diff: `diff --git a/src/auth/resetToken.ts b/src/auth/resetToken.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/auth/resetToken.ts
@@ -0,0 +1,10 @@
+export function createResetToken() {
+  // Math.random is not cryptographically secure for auth tokens.
+  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
+}
+
+export function tokenExpiresAt(hours = 1) {
+  return new Date(Date.now() + hours * 60 * 60 * 1000);
+}
`,
  },
  {
    id: 'sec-open-redirect',
    language: 'typescript',
    prTitle: 'Post-login redirect helper',
    prDescription: 'Send users back to the page they requested.',
    diffPath: 'diffs/sec-open-redirect.diff',
    negative: false,
    expected: [
      {
        id: 'redirect',
        file: 'src/auth/redirect.ts',
        line: 3,
        lineTolerance: 2,
        category: 'security',
        severityMin: 'medium',
        keywords: ['redirect', 'open', 'unvalidated', 'url', 'next'],
      },
    ],
    diff: `diff --git a/src/auth/redirect.ts b/src/auth/redirect.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/auth/redirect.ts
@@ -0,0 +1,8 @@
+export function postLoginRedirect(next: string | undefined) {
+  // Reflects next without allowlisting relative paths.
+  return next ?? '/dashboard';
+}
+
+export function loginPath() {
+  return '/login';
+}
`,
  },
  {
    id: 'err-empty-catch',
    language: 'typescript',
    prTitle: 'Persist analytics events',
    prDescription: 'Fire-and-forget analytics writes.',
    diffPath: 'diffs/err-empty-catch.diff',
    negative: false,
    expected: [
      {
        id: 'empty-catch',
        file: 'src/analytics/track.ts',
        line: 8,
        lineTolerance: 2,
        category: 'error-handling',
        severityMin: 'medium',
        keywords: ['catch', 'empty', 'swallow', 'ignore', 'silent'],
      },
    ],
    diff: `diff --git a/src/analytics/track.ts b/src/analytics/track.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/analytics/track.ts
@@ -0,0 +1,12 @@
+type Bus = { publish: (event: string, payload: unknown) => Promise<void> };
+
+export async function track(bus: Bus, event: string, payload: unknown) {
+  try {
+    await bus.publish(event, payload);
+  } catch {
+    // Empty catch swallows publish failures.
+  }
+}
+
+export function pageView(path: string) {
+  return { type: 'page_view', path };
+}
`,
  },
  {
    id: 'err-unhandled-rejection',
    language: 'typescript',
    prTitle: 'Warm cache on boot',
    prDescription: 'Prefetch hot keys without blocking startup.',
    diffPath: 'diffs/err-unhandled-rejection.diff',
    negative: false,
    expected: [
      {
        id: 'unhandled',
        file: 'src/cache/warm.ts',
        line: 6,
        lineTolerance: 2,
        category: 'error-handling',
        severityMin: 'medium',
        keywords: ['promise', 'await', 'unhandled', 'rejection', 'catch'],
      },
    ],
    diff: `diff --git a/src/cache/warm.ts b/src/cache/warm.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/cache/warm.ts
@@ -0,0 +1,10 @@
+type Cache = { get: (key: string) => Promise<string | null> };
+
+export function warmHotKeys(cache: Cache, keys: string[]) {
+  // Floating promise: rejections are not handled.
+  keys.forEach((key) => {
+    cache.get(key);
+  });
+}
+
+export const HOT_KEYS = ['home', 'pricing'];
`,
  },
  {
    id: 'logic-loose-equality',
    language: 'typescript',
    prTitle: 'Admin role gate',
    prDescription: 'Restrict destructive actions to admins.',
    diffPath: 'diffs/logic-loose-equality.diff',
    negative: false,
    expected: [
      {
        id: 'eqeq',
        file: 'src/auth/isAdmin.ts',
        line: 3,
        lineTolerance: 1,
        category: 'logic',
        severityMin: 'medium',
        keywords: ['==', 'equality', 'loose', '===', 'coercion'],
      },
    ],
    diff: `diff --git a/src/auth/isAdmin.ts b/src/auth/isAdmin.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/auth/isAdmin.ts
@@ -0,0 +1,8 @@
+export function isAdmin(role: string | number) {
+  // Loose equality can coerce unexpected values to true.
+  return role == 'admin';
+}
+
+export function isMember(role: string) {
+  return role === 'member';
+}
`,
  },
  {
    id: 'logic-shared-mutation',
    language: 'typescript',
    prTitle: 'Default filter options',
    prDescription: 'Shared defaults for list endpoints.',
    diffPath: 'diffs/logic-shared-mutation.diff',
    negative: false,
    expected: [
      {
        id: 'mutate',
        file: 'src/filters/defaults.ts',
        line: 6,
        lineTolerance: 2,
        category: 'logic',
        severityMin: 'medium',
        keywords: ['mutat', 'shared', 'default', 'push', 'reuse'],
      },
    ],
    diff: `diff --git a/src/filters/defaults.ts b/src/filters/defaults.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/filters/defaults.ts
@@ -0,0 +1,12 @@
+const DEFAULT_TAGS: string[] = [];
+
+export function withTag(tag: string) {
+  // Mutates a module-level array shared across callers.
+  DEFAULT_TAGS.push(tag);
+  return DEFAULT_TAGS;
+}
+
+export function resetTags() {
+  DEFAULT_TAGS.length = 0;
+}
`,
  },
  {
    id: 'perf-sync-fs',
    language: 'typescript',
    prTitle: 'Load theme CSS in request path',
    prDescription: 'Serve theme files per request.',
    diffPath: 'diffs/perf-sync-fs.diff',
    negative: false,
    expected: [
      {
        id: 'syncfs',
        file: 'src/http/theme.ts',
        line: 5,
        lineTolerance: 2,
        category: 'performance',
        severityMin: 'medium',
        keywords: ['sync', 'readFileSync', 'blocking', 'fs', 'request'],
      },
    ],
    diff: `diff --git a/src/http/theme.ts b/src/http/theme.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/http/theme.ts
@@ -0,0 +1,10 @@
+import fs from 'fs';
+import path from 'path';
+
+export function loadThemeCss(theme: string) {
+  // Synchronous disk IO on the request path.
+  return fs.readFileSync(path.join('themes', \`\${theme}.css\`), 'utf8');
+}
+
+export function themePath(theme: string) {
+  return path.join('themes', \`\${theme}.css\`);
+}
`,
  },
  {
    id: 'perf-unbounded-array',
    language: 'typescript',
    prTitle: 'Collect all audit events',
    prDescription: 'Buffer events before flush.',
    diffPath: 'diffs/perf-unbounded-array.diff',
    negative: false,
    expected: [
      {
        id: 'unbounded',
        file: 'src/audit/buffer.ts',
        line: 6,
        lineTolerance: 2,
        category: 'performance',
        severityMin: 'medium',
        keywords: ['unbounded', 'memory', 'push', 'grow', 'limit'],
      },
    ],
    diff: `diff --git a/src/audit/buffer.ts b/src/audit/buffer.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/audit/buffer.ts
@@ -0,0 +1,12 @@
+const events: unknown[] = [];
+
+export function record(event: unknown) {
+  // Grows forever with no cap or flush.
+  events.push(event);
+}
+
+export function snapshot() {
+  return events.slice();
+}
`,
  },
  {
    id: 'cq-deep-nesting',
    language: 'typescript',
    prTitle: 'Nested order status mapper',
    prDescription: 'Map provider statuses to internal enums.',
    diffPath: 'diffs/cq-deep-nesting.diff',
    negative: false,
    expected: [
      {
        id: 'nest',
        file: 'src/orders/mapStatus.ts',
        line: 4,
        lineTolerance: 3,
        category: 'code-quality',
        severityMin: 'low',
        keywords: ['nest', 'complex', 'readable', 'refactor', 'if'],
      },
    ],
    diff: `diff --git a/src/orders/mapStatus.ts b/src/orders/mapStatus.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/orders/mapStatus.ts
@@ -0,0 +1,18 @@
+export function mapStatus(provider: string, raw: string) {
+  if (provider === 'stripe') {
+    if (raw === 'paid') {
+      if (true) {
+        if (raw.length > 0) {
+          return 'completed';
+        }
+      }
+    }
+  }
+  return 'unknown';
+}
+
+export function isTerminal(status: string) {
+  return status === 'completed' || status === 'canceled';
+}
`,
  },
  {
    id: 'cq-magic-string',
    language: 'typescript',
    prTitle: 'Feature flag string compare',
    prDescription: 'Gate beta UI behind a flag name.',
    diffPath: 'diffs/cq-magic-string.diff',
    negative: false,
    expected: [
      {
        id: 'magic',
        file: 'src/flags/beta.ts',
        line: 2,
        lineTolerance: 2,
        category: 'code-quality',
        severityMin: 'low',
        keywords: ['magic', 'string', 'constant', 'hardcoded', 'flag'],
      },
    ],
    diff: `diff --git a/src/flags/beta.ts b/src/flags/beta.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/flags/beta.ts
@@ -0,0 +1,8 @@
+export function isBetaEnabled(flagName: string) {
+  return flagName === 'enable_beta_checkout_v3_final';
+}
+
+export function defaultFlags() {
+  return [] as string[];
+}
`,
  },
  {
    id: 'type-non-null-assertion',
    language: 'typescript',
    prTitle: 'Read optional user email',
    prDescription: 'Prefer email when present on the session.',
    diffPath: 'diffs/type-non-null-assertion.diff',
    negative: false,
    expected: [
      {
        id: 'bang',
        file: 'src/session/email.ts',
        line: 5,
        lineTolerance: 1,
        category: 'type-safety',
        severityMin: 'medium',
        keywords: ['non-null', 'assertion', '!', 'optional', 'undefined'],
      },
    ],
    diff: `diff --git a/src/session/email.ts b/src/session/email.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/session/email.ts
@@ -0,0 +1,8 @@
+type Session = { email?: string };
+
+export function requireEmail(session: Session) {
+  // Non-null assertion on an optional field.
+  return session.email!.toLowerCase();
+}
+
+export function hasEmail(session: Session) {
+  return Boolean(session.email);
+}
`,
  },
  {
    id: 'type-double-cast',
    language: 'typescript',
    prTitle: 'Cast webhook payload',
    prDescription: 'Treat unknown JSON as a typed event.',
    diffPath: 'diffs/type-double-cast.diff',
    negative: false,
    expected: [
      {
        id: 'cast',
        file: 'src/webhooks/parse.ts',
        line: 6,
        lineTolerance: 1,
        category: 'type-safety',
        severityMin: 'medium',
        keywords: ['cast', 'unknown', 'as', 'unsafe', 'validate'],
      },
    ],
    diff: `diff --git a/src/webhooks/parse.ts b/src/webhooks/parse.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/webhooks/parse.ts
@@ -0,0 +1,10 @@
+type InvoiceEvent = { id: string; amount: number };
+
+export function parseInvoiceEvent(raw: unknown) {
+  // Double assertion skips runtime validation.
+  return raw as unknown as InvoiceEvent;
+}
+
+export function isObject(value: unknown) {
+  return typeof value === 'object' && value !== null;
+}
`,
  },
  {
    id: 'bp-missing-timeout',
    language: 'typescript',
    prTitle: 'Call partner API',
    prDescription: 'Forward inventory checks upstream.',
    diffPath: 'diffs/bp-missing-timeout.diff',
    negative: false,
    expected: [
      {
        id: 'timeout',
        file: 'src/partners/inventory.ts',
        line: 3,
        lineTolerance: 2,
        category: 'best-practices',
        severityMin: 'medium',
        keywords: ['timeout', 'abort', 'hang', 'fetch', 'signal'],
      },
    ],
    diff: `diff --git a/src/partners/inventory.ts b/src/partners/inventory.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/partners/inventory.ts
@@ -0,0 +1,10 @@
+export async function checkStock(sku: string) {
+  // Fetch without AbortSignal / timeout.
+  const response = await fetch(\`https://partner.example/stock/\${sku}\`);
+  return response.json();
+}
+
+export function stockUrl(sku: string) {
+  return \`https://partner.example/stock/\${sku}\`;
+}
`,
  },
  {
    id: 'bp-logged-pii',
    language: 'typescript',
    prTitle: 'Log failed sign-in',
    prDescription: 'Debug authentication failures.',
    diffPath: 'diffs/bp-logged-pii.diff',
    negative: false,
    expected: [
      {
        id: 'pii',
        file: 'src/auth/logFailure.ts',
        line: 4,
        lineTolerance: 2,
        category: 'best-practices',
        severityMin: 'medium',
        keywords: ['pii', 'password', 'log', 'sensitive', 'credential'],
      },
    ],
    diff: `diff --git a/src/auth/logFailure.ts b/src/auth/logFailure.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/auth/logFailure.ts
@@ -0,0 +1,8 @@
+export function logSignInFailure(email: string, password: string) {
+  // Logs raw password material.
+  console.error('signin failed', { email, password });
+}
+
+export function redact(value: string) {
+  return value.slice(0, 2) + '***';
+}
`,
  },
  {
    id: 'logic-wrong-length',
    language: 'typescript',
    prTitle: 'Paginate search hits',
    prDescription: 'Slice results for the UI.',
    diffPath: 'diffs/logic-wrong-length.diff',
    negative: false,
    expected: [
      {
        id: 'slice',
        file: 'src/search/page.ts',
        line: 3,
        lineTolerance: 1,
        category: 'logic',
        severityMin: 'medium',
        keywords: ['off-by', 'slice', 'page', 'index', 'length'],
      },
    ],
    diff: `diff --git a/src/search/page.ts b/src/search/page.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/search/page.ts
@@ -0,0 +1,8 @@
+export function pageItems<T>(items: T[], page: number, size: number) {
+  // Uses 1-based page but multiplies as if 0-based incorrectly for last page edge.
+  const start = page * size;
+  return items.slice(start, start + size);
+}
+
+export function pageCount(total: number, size: number) {
+  return Math.ceil(total / size);
+}
`,
  },
  {
    id: 'sec-cors-star',
    language: 'typescript',
    prTitle: 'Enable CORS for SPA',
    prDescription: 'Allow browser clients to call the API.',
    diffPath: 'diffs/sec-cors-star.diff',
    negative: false,
    expected: [
      {
        id: 'cors',
        file: 'src/http/cors.ts',
        line: 3,
        lineTolerance: 2,
        category: 'security',
        severityMin: 'medium',
        keywords: ['cors', 'origin', '*', 'wildcard', 'credential'],
      },
    ],
    diff: `diff --git a/src/http/cors.ts b/src/http/cors.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/http/cors.ts
@@ -0,0 +1,10 @@
+export function corsHeaders() {
+  return {
+    'Access-Control-Allow-Origin': '*',
+    'Access-Control-Allow-Credentials': 'true',
+  };
+}
+
+export function isPreflight(method: string) {
+  return method === 'OPTIONS';
+}
`,
  },
  // --- clean cases ---
  {
    id: 'clean-path-basename',
    language: 'typescript',
    prTitle: 'Safe avatar path',
    prDescription: 'Only allow basenames under uploads.',
    diffPath: 'diffs/clean-path-basename.diff',
    negative: true,
    expected: [],
    diff: `diff --git a/src/files/safeAvatar.ts b/src/files/safeAvatar.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/files/safeAvatar.ts
@@ -0,0 +1,12 @@
+import fs from 'fs/promises';
+import path from 'path';
+
+const UPLOADS = '/var/app/uploads';
+
+export async function readAvatar(fileName: string) {
+  const base = path.basename(fileName);
+  const target = path.join(UPLOADS, base);
+  if (!target.startsWith(UPLOADS)) {
+    throw new Error('invalid path');
+  }
+  return fs.readFile(target);
+}
`,
  },
  {
    id: 'clean-url-allowlist',
    language: 'typescript',
    prTitle: 'Allowlisted preview fetch',
    prDescription: 'Only fetch from CDN hosts.',
    diffPath: 'diffs/clean-url-allowlist.diff',
    negative: true,
    expected: [],
    diff: `diff --git a/src/http/safePreview.ts b/src/http/safePreview.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/http/safePreview.ts
@@ -0,0 +1,14 @@
+const ALLOWED = new Set(['cdn.example.com', 'images.example.com']);
+
+export async function fetchPreview(imageUrl: string) {
+  const parsed = new URL(imageUrl);
+  if (!ALLOWED.has(parsed.hostname)) {
+    throw new Error('host not allowed');
+  }
+  const response = await fetch(parsed.toString());
+  return Buffer.from(await response.arrayBuffer());
+}
`,
  },
  {
    id: 'clean-crypto-token',
    language: 'typescript',
    prTitle: 'Secure reset tokens',
    prDescription: 'Use crypto random bytes for tokens.',
    diffPath: 'diffs/clean-crypto-token.diff',
    negative: true,
    expected: [],
    diff: `diff --git a/src/auth/secureResetToken.ts b/src/auth/secureResetToken.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/auth/secureResetToken.ts
@@ -0,0 +1,8 @@
+import crypto from 'crypto';
+
+export function createResetToken() {
+  return crypto.randomBytes(32).toString('hex');
+}
+
+export function tokenExpiresAt(hours = 1) {
+  return new Date(Date.now() + hours * 60 * 60 * 1000);
+}
`,
  },
  {
    id: 'clean-relative-redirect',
    language: 'typescript',
    prTitle: 'Safe post-login redirect',
    prDescription: 'Only allow relative next paths.',
    diffPath: 'diffs/clean-relative-redirect.diff',
    negative: true,
    expected: [],
    diff: `diff --git a/src/auth/safeRedirect.ts b/src/auth/safeRedirect.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/auth/safeRedirect.ts
@@ -0,0 +1,10 @@
+export function postLoginRedirect(next: string | undefined) {
+  if (!next || !next.startsWith('/') || next.startsWith('//')) {
+    return '/dashboard';
+  }
+  return next;
+}
`,
  },
  {
    id: 'clean-logged-error',
    language: 'typescript',
    prTitle: 'Analytics with logging',
    prDescription: 'Log publish failures without swallowing silently.',
    diffPath: 'diffs/clean-logged-error.diff',
    negative: true,
    expected: [],
    diff: `diff --git a/src/analytics/safeTrack.ts b/src/analytics/safeTrack.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/analytics/safeTrack.ts
@@ -0,0 +1,12 @@
+type Bus = { publish: (event: string, payload: unknown) => Promise<void> };
+
+export async function track(bus: Bus, event: string, payload: unknown) {
+  try {
+    await bus.publish(event, payload);
+  } catch (error) {
+    console.error('analytics publish failed', error);
+  }
+}
`,
  },
  {
    id: 'clean-await-cache',
    language: 'typescript',
    prTitle: 'Awaited cache warm',
    prDescription: 'Wait for prefetch with Promise.allSettled.',
    diffPath: 'diffs/clean-await-cache.diff',
    negative: true,
    expected: [],
    diff: `diff --git a/src/cache/safeWarm.ts b/src/cache/safeWarm.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/cache/safeWarm.ts
@@ -0,0 +1,8 @@
+type Cache = { get: (key: string) => Promise<string | null> };
+
+export async function warmHotKeys(cache: Cache, keys: string[]) {
+  await Promise.allSettled(keys.map((key) => cache.get(key)));
+}
`,
  },
  {
    id: 'clean-strict-equality',
    language: 'typescript',
    prTitle: 'Strict admin check',
    prDescription: 'Compare roles with ===.',
    diffPath: 'diffs/clean-strict-equality.diff',
    negative: true,
    expected: [],
    diff: `diff --git a/src/auth/strictAdmin.ts b/src/auth/strictAdmin.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/auth/strictAdmin.ts
@@ -0,0 +1,4 @@
+export function isAdmin(role: string) {
+  return role === 'admin';
+}
`,
  },
  {
    id: 'clean-async-fs',
    language: 'typescript',
    prTitle: 'Async theme loader',
    prDescription: 'Non-blocking theme CSS reads.',
    diffPath: 'diffs/clean-async-fs.diff',
    negative: true,
    expected: [],
    diff: `diff --git a/src/http/asyncTheme.ts b/src/http/asyncTheme.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/http/asyncTheme.ts
@@ -0,0 +1,8 @@
+import fs from 'fs/promises';
+import path from 'path';
+
+export async function loadThemeCss(theme: string) {
+  return fs.readFile(path.join('themes', \`\${theme}.css\`), 'utf8');
+}
`,
  },
  {
    id: 'clean-capped-buffer',
    language: 'typescript',
    prTitle: 'Capped audit buffer',
    prDescription: 'Drop oldest events when full.',
    diffPath: 'diffs/clean-capped-buffer.diff',
    negative: true,
    expected: [],
    diff: `diff --git a/src/audit/cappedBuffer.ts b/src/audit/cappedBuffer.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/audit/cappedBuffer.ts
@@ -0,0 +1,12 @@
+const MAX = 1000;
+const events: unknown[] = [];
+
+export function record(event: unknown) {
+  events.push(event);
+  if (events.length > MAX) {
+    events.shift();
+  }
+}
`,
  },
  {
    id: 'clean-type-guard',
    language: 'typescript',
    prTitle: 'Guarded email reader',
    prDescription: 'Check optional email before use.',
    diffPath: 'diffs/clean-type-guard.diff',
    negative: true,
    expected: [],
    diff: `diff --git a/src/session/safeEmail.ts b/src/session/safeEmail.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/session/safeEmail.ts
@@ -0,0 +1,10 @@
+type Session = { email?: string };
+
+export function requireEmail(session: Session) {
+  if (!session.email) {
+    throw new Error('email required');
+  }
+  return session.email.toLowerCase();
+}
`,
  },
  {
    id: 'clean-zod-parse',
    language: 'typescript',
    prTitle: 'Zod webhook parse',
    prDescription: 'Validate invoice events at the boundary.',
    diffPath: 'diffs/clean-zod-parse.diff',
    negative: true,
    expected: [],
    diff: `diff --git a/src/webhooks/safeParse.ts b/src/webhooks/safeParse.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/webhooks/safeParse.ts
@@ -0,0 +1,12 @@
+import { z } from 'zod';
+
+const invoiceEventSchema = z.object({
+  id: z.string(),
+  amount: z.number(),
+});
+
+export function parseInvoiceEvent(raw: unknown) {
+  return invoiceEventSchema.parse(raw);
+}
`,
  },
  {
    id: 'clean-fetch-timeout',
    language: 'typescript',
    prTitle: 'Partner fetch with timeout',
    prDescription: 'Abort inventory calls after 3s.',
    diffPath: 'diffs/clean-fetch-timeout.diff',
    negative: true,
    expected: [],
    diff: `diff --git a/src/partners/safeInventory.ts b/src/partners/safeInventory.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/partners/safeInventory.ts
@@ -0,0 +1,10 @@
+export async function checkStock(sku: string) {
+  const controller = new AbortController();
+  const timer = setTimeout(() => controller.abort(), 3000);
+  try {
+    const response = await fetch(\`https://partner.example/stock/\${sku}\`, {
+      signal: controller.signal,
+    });
+    return response.json();
+  } finally {
+    clearTimeout(timer);
+  }
+}
`,
  },
];

function main(): void {
  fs.mkdirSync(diffsDir, { recursive: true });

  const existing = JSON.parse(fs.readFileSync(casesPath, 'utf8')) as {
    version: string;
    cases: Array<Omit<CaseDef, 'diff'>>;
  };

  const byId = new Map(existing.cases.map((c) => [c.id, c]));

  for (const item of NEW_CASES) {
    const abs = path.join(root, item.diffPath);
    fs.writeFileSync(abs, item.diff, 'utf8');
    const { diff: _diff, ...meta } = item;
    byId.set(item.id, meta);
    console.log(`wrote ${item.id}`);
  }

  const cases = [...byId.values()];
  const positive = cases.filter((c) => !c.negative).length;
  const negative = cases.filter((c) => c.negative).length;

  const next = {
    version: '2.0.0',
    cases,
  };
  fs.writeFileSync(casesPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
  console.log(`\ncases.json → v${next.version}: ${cases.length} cases (${positive} positive, ${negative} clean)`);
}

main();
