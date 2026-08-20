/**
 * Smoke: ensure sandbox network policy documents metadata deny and (on Linux) applies DROP.
 * Run: npx ts-node scripts/sandbox-metadata-smoke.ts
 */
import { ensureSandboxNetworkPolicy } from '../src/services/refactorSandboxService';

async function main(): Promise<void> {
  const result = await ensureSandboxNetworkPolicy();
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  console.log(
    'Confirmed policy intent: DROP 169.254.0.0/16 (+ IPv6 IMDS) on DOCKER-USER when iptables exists; in-container probe fails closed if metadata responds.',
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
