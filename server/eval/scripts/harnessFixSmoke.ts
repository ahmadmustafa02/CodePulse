import { config as loadEnv } from 'dotenv';
import { createGroqKeyPool } from '../lib/groqKeyPool';
import { canRecoverEmptyIssuesFromError, looksLikeEmptyIntent } from '../lib/recoverEmptyIssues';

loadEnv();

const pool = createGroqKeyPool();
console.log(`key_pool_size=${pool.size}`);

const cases: Array<[string, boolean]> = [
  ['{"issues":[]}', true],
  ['No issues identified.', true],
  ['{"issues":[{"category":"security","title":"x"}]}', false],
];
for (const [s, expected] of cases) {
  const got = looksLikeEmptyIntent(s);
  if (got !== expected) {
    console.error(`FAIL looksLikeEmptyIntent(${JSON.stringify(s)}) got=${got} expected=${expected}`);
    process.exit(1);
  }
}

const recover = canRecoverEmptyIssuesFromError(
  new Error('400 {"error":{"message":"Tool choice is required","code":"tool_use_failed","failed_generation":"{\\"issues\\": []}"}}'),
);
if (!recover) {
  console.error('FAIL expected recover empty from tool_use_failed');
  process.exit(1);
}

console.log('harness_smoke_ok');
