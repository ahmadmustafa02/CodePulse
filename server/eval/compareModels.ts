/**
 * Runs offline eval twice (production model + comparison model) and writes a summary.
 *
 * Usage (from server/):
 *   npm run eval:compare
 *   EVAL_COMPARE_MODEL=openai/gpt-oss-120b npm run eval:compare
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { GROQ_MODEL } from '../src/config/constants';
import { formatPercent } from './lib/metrics';

const primary = process.env.EVAL_MODEL?.trim() || GROQ_MODEL;
const secondary =
  process.env.EVAL_COMPARE_MODEL?.trim() || 'openai/gpt-oss-20b';

function runEval(model: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['ts-node', 'eval/runEval.ts', '--model', model],
      {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env: { ...process.env, EVAL_MODEL: model },
      },
    );
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

type Report = {
  model: string;
  datasetVersion: string;
  datasetSize: number;
  metrics: {
    tp: number;
    fp: number;
    fn: number;
    precision: number | null;
    recall: number | null;
    f1: number | null;
    categoryPrecisionRecall: Array<{
      category: string;
      tp: number;
      fp: number;
      fn: number;
      precision: number | null;
      recall: number | null;
      f1: number | null;
    }>;
  };
};

function loadReport(model: string): Report {
  const slug = model.replace(/[^a-zA-Z0-9._-]+/g, '_');
  const file = path.join(__dirname, 'results', `latest-${slug}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Report;
}

async function main(): Promise<void> {
  console.log(`Compare: primary=${primary} secondary=${secondary}\n`);

  const code1 = await runEval(primary);
  if (code1 !== 0) {
    process.exit(code1);
  }
  const code2 = await runEval(secondary);
  if (code2 !== 0) {
    process.exit(code2);
  }

  const a = loadReport(primary);
  const b = loadReport(secondary);

  const lines: string[] = [];
  lines.push('# CodePulse model comparison');
  lines.push('');
  lines.push(`- Dataset: v${a.datasetVersion} (${a.datasetSize} cases)`);
  lines.push(`- Primary: \`${a.model}\``);
  lines.push(`- Secondary: \`${b.model}\``);
  lines.push('');
  lines.push('| Model | Precision | Recall | F1 | TP | FP | FN |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  lines.push(
    `| ${a.model} | ${formatPercent(a.metrics.precision)} | ${formatPercent(a.metrics.recall)} | ${formatPercent(a.metrics.f1)} | ${a.metrics.tp} | ${a.metrics.fp} | ${a.metrics.fn} |`,
  );
  lines.push(
    `| ${b.model} | ${formatPercent(b.metrics.precision)} | ${formatPercent(b.metrics.recall)} | ${formatPercent(b.metrics.f1)} | ${b.metrics.tp} | ${b.metrics.fp} | ${b.metrics.fn} |`,
  );
  lines.push('');
  lines.push('## Per-category (primary)');
  lines.push('');
  lines.push('| Category | P | R | F1 |');
  lines.push('|---|---:|---:|---:|');
  for (const row of a.metrics.categoryPrecisionRecall) {
    lines.push(
      `| ${row.category} | ${formatPercent(row.precision)} | ${formatPercent(row.recall)} | ${formatPercent(row.f1)} |`,
    );
  }
  lines.push('');
  lines.push('## Per-category (secondary)');
  lines.push('');
  lines.push('| Category | P | R | F1 |');
  lines.push('|---|---:|---:|---:|');
  for (const row of b.metrics.categoryPrecisionRecall) {
    lines.push(
      `| ${row.category} | ${formatPercent(row.precision)} | ${formatPercent(row.recall)} | ${formatPercent(row.f1)} |`,
    );
  }
  lines.push('');

  const out = path.join(__dirname, 'results', 'comparison.md');
  fs.writeFileSync(out, lines.join('\n'), 'utf8');
  console.log(`\nWrote ${out}`);
  console.log(lines.join('\n'));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
