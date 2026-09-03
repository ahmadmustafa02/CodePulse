/**
 * Phase 2 adversarial eval: run taxonomy cases through defense.scanUntrustedContent
 * and write catch/miss metrics by category.
 *
 * Usage (from server/):
 *   npm run eval-harness:run
 *
 * Optional: EVAL_HARNESS_JUDGE=true — reserved stub (classifier-only metrics today).
 * Requires OPENAI_API_KEY. Forces INJECTION_DEFENSE_ENABLED for this process.
 */

import { config as loadEnv } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

loadEnv({ override: true });

process.env.INJECTION_DEFENSE_ENABLED = 'true';
process.env.INJECTION_DEFENSE_INSTALLATION_ALLOWLIST = '';

type Expected = 'malicious' | 'benign';

type TaxonomyCase = {
  id: string;
  category: string;
  expected: Expected;
  title: string;
  body: string;
  filenames: string[];
  diffPreview: string;
};

type TaxonomyFile = {
  version: number;
  cases: TaxonomyCase[];
  catchDefinition?: string;
};

type CaseResult = {
  id: string;
  category: string;
  expected: Expected;
  outcome: string;
  scoreMalicious: number;
  scoreSafe: number;
  model: string;
  caught: boolean;
};

function isCaught(expected: Expected, outcome: string): boolean {
  if (expected === 'malicious') {
    return outcome === 'flag' || outcome === 'block';
  }
  return outcome === 'allow';
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for eval-harness');
  }

  if (process.env.EVAL_HARNESS_JUDGE === 'true') {
    process.stdout.write(
      'EVAL_HARNESS_JUDGE=true: LLM judge reserved/not implemented; classifier-only metrics.\n',
    );
  }

  const { scanUntrustedContent } = await import('../defense');

  const taxonomyPath = path.join(__dirname, 'taxonomy', 'attacks.json');
  const taxonomy = JSON.parse(fs.readFileSync(taxonomyPath, 'utf8')) as TaxonomyFile;
  if (!Array.isArray(taxonomy.cases) || taxonomy.cases.length === 0) {
    throw new Error('taxonomy/attacks.json has no cases');
  }

  const rows: CaseResult[] = [];
  for (const c of taxonomy.cases) {
    const result = await scanUntrustedContent({
      title: c.title,
      body: c.body,
      filenames: c.filenames,
      formattedDiffPreview: c.diffPreview,
      jobId: `eval-${c.id}`,
      organizationId: 'eval-harness',
      skipPersist: true,
    });
    const caught = isCaught(c.expected, result.outcome);
    rows.push({
      id: c.id,
      category: c.category,
      expected: c.expected,
      outcome: result.outcome,
      scoreMalicious: result.scoreMalicious,
      scoreSafe: result.scoreSafe,
      model: result.model,
      caught,
    });
    process.stdout.write(
      `${caught ? 'CATCH' : 'MISS '} ${c.id} [${c.category}] expected=${c.expected} got=${result.outcome} pMal=${result.scoreMalicious.toFixed(3)}\n`,
    );
  }

  const byCategory: Record<
    string,
    { total: number; caught: number; catchRate: number }
  > = {};
  for (const row of rows) {
    const bucket = byCategory[row.category] ?? { total: 0, caught: 0, catchRate: 0 };
    bucket.total += 1;
    if (row.caught) bucket.caught += 1;
    byCategory[row.category] = bucket;
  }
  for (const cat of Object.keys(byCategory)) {
    const b = byCategory[cat];
    b.catchRate = b.total === 0 ? 0 : b.caught / b.total;
  }

  const overallCaught = rows.filter((r) => r.caught).length;
  const report = {
    version: 1,
    ranAt: new Date().toISOString(),
    catchDefinition:
      taxonomy.catchDefinition ??
      'malicious→flag|block; benign→allow',
    summary: {
      total: rows.length,
      caught: overallCaught,
      missed: rows.length - overallCaught,
      catchRate: rows.length === 0 ? 0 : overallCaught / rows.length,
    },
    byCategory,
    cases: rows,
  };

  const outDir = path.join(__dirname, 'results');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'latest.json');
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`\nWrote ${outPath}\n`);
  process.stdout.write(
    `overall catchRate=${report.summary.catchRate.toFixed(3)} (${overallCaught}/${rows.length})\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
