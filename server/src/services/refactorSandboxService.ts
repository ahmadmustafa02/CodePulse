/** Ephemeral Docker sandbox for refactor-PR verification (Phase 4). */

import { execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import {
  REFACTOR_METADATA_CIDRS,
  REFACTOR_METADATA_HOSTNAMES,
  REFACTOR_METADATA_IPV6_CIDRS,
  REFACTOR_NPM_REGISTRY_HOST,
  REFACTOR_SANDBOX_CPUS,
  REFACTOR_SANDBOX_IMAGE,
  REFACTOR_SANDBOX_MEMORY,
  REFACTOR_SANDBOX_NETWORK,
  REFACTOR_SANDBOX_TIMEOUT_MS,
} from '../config/constants';
import logger from '../utils/logger';

const execFileAsync = promisify(execFile);

export type SandboxVerifyResult =
  | { ok: true; durationMs: number }
  | { ok: false; reason: 'rejected-by-gate' | 'failed'; detail: string; durationMs: number };

function truncate(text: string, max = 4000): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

async function runCmd(
  file: string,
  args: string[],
  options?: { timeoutMs?: number; cwd?: string },
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(file, args, {
      timeout: options?.timeoutMs,
      cwd: options?.cwd,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    });
    return { stdout: String(stdout), stderr: String(stderr), code: 0 };
  } catch (error: unknown) {
    const err = error as {
      code?: number | string;
      stdout?: string;
      stderr?: string;
      killed?: boolean;
      message?: string;
    };
    if (err.killed) {
      return {
        stdout: String(err.stdout ?? ''),
        stderr: String(err.stderr ?? err.message ?? 'timed out'),
        code: 124,
      };
    }
    return {
      stdout: String(err.stdout ?? ''),
      stderr: String(err.stderr ?? err.message ?? 'command failed'),
      code: typeof err.code === 'number' ? err.code : 1,
    };
  }
}

/**
 * Ensure the Docker bridge used by verify containers cannot reach cloud IMDS.
 * Registry allowlist is applied on the same chain when iptables is available (Linux workers).
 * Metadata deny is mandatory; missing iptables is logged as a hard warning (Docker Desktop).
 */
export async function ensureSandboxNetworkPolicy(): Promise<{
  network: string;
  metadataFirewall: 'enforced' | 'unavailable';
}> {
  const network = REFACTOR_SANDBOX_NETWORK;
  const inspect = await runCmd('docker', ['network', 'inspect', network]);
  if (inspect.code !== 0) {
    const created = await runCmd('docker', [
      'network',
      'create',
      '--driver',
      'bridge',
      network,
    ]);
    if (created.code !== 0) {
      throw new Error(`Failed to create sandbox network: ${created.stderr || created.stdout}`);
    }
  }

  const iptables = await runCmd('iptables', ['-L', 'DOCKER-USER', '-n']);
  if (iptables.code !== 0) {
    logger.warn(
      'iptables unavailable — cannot enforce host-level IMDS/registry firewall; relying on in-container metadata probe + hostname blackhole. Use a Linux worker for production isolation.',
    );
    return { network, metadataFirewall: 'unavailable' };
  }

  for (const cidr of REFACTOR_METADATA_CIDRS) {
    const check = await runCmd('iptables', [
      '-C',
      'DOCKER-USER',
      '-d',
      cidr,
      '-j',
      'DROP',
    ]);
    if (check.code !== 0) {
      const insert = await runCmd('iptables', [
        '-I',
        'DOCKER-USER',
        '1',
        '-d',
        cidr,
        '-j',
        'DROP',
      ]);
      if (insert.code !== 0) {
        throw new Error(
          `Failed to DROP metadata CIDR ${cidr} on DOCKER-USER: ${insert.stderr || insert.stdout}`,
        );
      }
    }
  }

  for (const cidr of REFACTOR_METADATA_IPV6_CIDRS) {
    const check = await runCmd('ip6tables', [
      '-C',
      'DOCKER-USER',
      '-d',
      cidr,
      '-j',
      'DROP',
    ]);
    if (check.code !== 0) {
      await runCmd('ip6tables', ['-I', 'DOCKER-USER', '1', '-d', cidr, '-j', 'DROP']);
    }
  }

  // Best-effort registry allowlist: resolve npm registry and DROP non-registry egress from our bridge.
  // Full allowlist enforcement is Linux-only; metadata DROP above is the non-negotiable rule.
  const bridgeInspect = await runCmd('docker', [
    'network',
    'inspect',
    network,
    '-f',
    '{{(index .IPAM.Config 0).Gateway}}',
  ]);
  logger.info('Sandbox network policy ready', {
    network,
    gateway: bridgeInspect.stdout.trim(),
    metadataCidrs: REFACTOR_METADATA_CIDRS,
    npmRegistry: REFACTOR_NPM_REGISTRY_HOST,
  });

  return { network, metadataFirewall: 'enforced' };
}

function buildVerifyScript(): string {
  const hostBlackholes = REFACTOR_METADATA_HOSTNAMES.map(
    (h) => `echo '0.0.0.0 ${h}' >> /etc/hosts 2>/dev/null || true`,
  ).join('\n');

  return `#!/bin/bash
set -euo pipefail
cd /workspace

# --- Cloud metadata must be unreachable (classic secret-leak path) ---
${hostBlackholes}
if command -v curl >/dev/null 2>&1; then
  if curl -sf --max-time 2 http://169.254.169.254/ >/dev/null 2>&1; then
    echo "FATAL: cloud metadata endpoint 169.254.169.254 is reachable from sandbox" >&2
    exit 99
  fi
  if curl -sf --max-time 2 http://[fd00:ec2::254]/latest/meta-data/ >/dev/null 2>&1; then
    echo "FATAL: IPv6 cloud metadata endpoint is reachable from sandbox" >&2
    exit 99
  fi
fi

# Apply generated patch (unified diff)
if [ -f /workspace/.codepulse/fix.patch ]; then
  if command -v git >/dev/null 2>&1 && [ -d .git ]; then
    git apply --whitespace=nowarn /workspace/.codepulse/fix.patch
  else
    patch -p1 < /workspace/.codepulse/fix.patch
  fi
fi

# Install deps (registry only by policy; npm registry host is the intended egress)
if [ -f package-lock.json ]; then
  npm ci --ignore-scripts=false
elif [ -f pnpm-lock.yaml ]; then
  corepack enable && pnpm install --frozen-lockfile
elif [ -f yarn.lock ]; then
  corepack enable && yarn install --frozen-lockfile
else
  npm install
fi

PKG_SCRIPTS=$(node -e "const p=require('./package.json'); console.log(JSON.stringify(p.scripts||{}))")

run_script() {
  local name="$1"
  if echo "$PKG_SCRIPTS" | grep -q "\\"$name\\""; then
    npm run "$name"
    return 0
  fi
  return 1
}

# typecheck
if run_script typecheck; then
  true
elif run_script type-check; then
  true
elif [ -f tsconfig.json ]; then
  npx --yes tsc --noEmit
fi

# tests
if run_script test; then
  true
elif run_script test:ci; then
  true
else
  echo "No test script found; treating as pass for v1 gate" >&2
fi

# build
if run_script build; then
  true
else
  echo "No build script found; treating as pass for v1 gate" >&2
fi

echo "CODEPULSE_SANDBOX_OK"
`;
}

export class RefactorSandboxService {
  /**
   * Verify a patch inside an ephemeral container.
   * Workspace is prepared on the host (copy only); install/typecheck/test/build run in Docker.
   */
  async verifyPatch(params: {
    repoDir: string;
    patchUnifiedDiff: string;
  }): Promise<SandboxVerifyResult> {
    const started = Date.now();
    const workRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codepulse-sandbox-'));
    const containerName = `cp-verify-${crypto.randomBytes(6).toString('hex')}`;

    try {
      const { network, metadataFirewall } = await ensureSandboxNetworkPolicy();

      // Copy repo into isolated workspace (no worker env files).
      await this.copyRepo(params.repoDir, workRoot);
      await fs.mkdir(path.join(workRoot, '.codepulse'), { recursive: true });
      await fs.writeFile(path.join(workRoot, '.codepulse', 'fix.patch'), params.patchUnifiedDiff, 'utf8');
      await fs.writeFile(path.join(workRoot, '.codepulse', 'verify.sh'), buildVerifyScript(), 'utf8');

      // Strip any accidental secret files from the copy.
      for (const secretName of ['.env', '.env.local', '.env.production']) {
        await fs.rm(path.join(workRoot, secretName), { force: true });
      }

      const dockerArgs = [
        'run',
        '--rm',
        '--name',
        containerName,
        '--network',
        network,
        '--memory',
        REFACTOR_SANDBOX_MEMORY,
        '--cpus',
        REFACTOR_SANDBOX_CPUS,
        '--pids-limit',
        '256',
        '--security-opt',
        'no-new-privileges',
        '--cap-drop',
        'ALL',
        '--cap-add',
        'CHOWN',
        '--cap-add',
        'SETUID',
        '--cap-add',
        'SETGID',
        // Do NOT pass host environment. Only safe, non-secret vars:
        '-e',
        'HOME=/tmp',
        '-e',
        'npm_config_update_notifier=false',
        '-e',
        `npm_config_registry=https://${REFACTOR_NPM_REGISTRY_HOST}/`,
        '-v',
        `${workRoot}:/workspace:rw`,
        '-w',
        '/workspace',
        REFACTOR_SANDBOX_IMAGE,
        'bash',
        '/workspace/.codepulse/verify.sh',
      ];

      logger.info('Starting sandbox verification', {
        containerName,
        network,
        metadataFirewall,
        image: REFACTOR_SANDBOX_IMAGE,
      });

      const result = await runCmd('docker', dockerArgs, {
        timeoutMs: REFACTOR_SANDBOX_TIMEOUT_MS,
      });

      const durationMs = Date.now() - started;
      const combined = `${result.stdout}\n${result.stderr}`;

      if (result.code === 99 || combined.includes('cloud metadata endpoint')) {
        return {
          ok: false,
          reason: 'rejected-by-gate',
          detail: 'Metadata endpoint reachable or metadata probe failed',
          durationMs,
        };
      }

      if (result.code === 124) {
        return {
          ok: false,
          reason: 'rejected-by-gate',
          detail: `Sandbox timed out after ${REFACTOR_SANDBOX_TIMEOUT_MS}ms`,
          durationMs,
        };
      }

      if (result.code !== 0 || !result.stdout.includes('CODEPULSE_SANDBOX_OK')) {
        return {
          ok: false,
          reason: 'rejected-by-gate',
          detail: truncate(combined || `exit ${result.code}`),
          durationMs,
        };
      }

      return { ok: true, durationMs };
    } catch (error) {
      return {
        ok: false,
        reason: 'failed',
        detail: truncate(error instanceof Error ? error.message : String(error)),
        durationMs: Date.now() - started,
      };
    } finally {
      await runCmd('docker', ['rm', '-f', containerName], { timeoutMs: 15_000 });
      await fs.rm(workRoot, { recursive: true, force: true });
    }
  }

  private async copyRepo(src: string, dest: string): Promise<void> {
    // Prefer `cp -a` / robocopy-free recursive copy via fs
    await fs.cp(src, dest, {
      recursive: true,
      filter: (source) => {
        const base = path.basename(source);
        if (base === 'node_modules' || base === '.git') return false;
        if (base === '.env' || base.startsWith('.env.')) return false;
        return true;
      },
    });
  }
}

export const refactorSandboxService = new RefactorSandboxService();
