/**
 * Verify Phase 4 IMDS host DROP on the target worker host (Linux).
 * Exit 0 only when iptables DOCKER-USER DROP for 169.254.0.0/16 is active.
 *
 * On Azure App Service Linux worker SSH/Kudu:
 *   cd /home/site/wwwroot && node -r ts-node/register scripts/verify-imds-host-drop.ts
 * or after build:
 *   node dist/../ — prefer: npm run test:imds-host after deploy with ts-node available,
 *   or run `iptables -C DOCKER-USER -d 169.254.0.0/16 -j DROP` directly.
 */
import { ensureSandboxNetworkPolicy } from '../src/services/refactorSandboxService';

async function main(): Promise<void> {
  const policy = await ensureSandboxNetworkPolicy();
  console.log(JSON.stringify(policy, null, 2));
  if (policy.metadataFirewall !== 'enforced') {
    console.error(
      'FAIL: host IMDS DROP not enforced. Phase 4 is not production-verified on this host.',
    );
    process.exit(1);
  }
  console.log('OK: host IMDS DROP enforced on DOCKER-USER for link-local metadata ranges.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
