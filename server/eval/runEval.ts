/**
 * Offline evaluation runner for CodePulse.
 * Checkpoint-resumable across Groq free-tier daily resets.
 *
 * Usage (from server/):
 *   npm run eval:offline
 *   npm run eval:offline -- --model openai/gpt-oss-20b
 *   npm run eval:offline -- --model openai/gpt-oss-20b --fresh
 *   EVAL_MAX_COMPLETION_TOKENS=2048 npm run eval:offline
 */

import fs from 'fs';
import path from 'path';
import { GROQ_MODEL } from '../src/config/constants';
import { groqAnalysisService } from '../src/services/groqAnalysisService';
import type { DetectedIssue } from '../src/types/analysis';
import { unifiedDiffToParsedDiff } from './lib/diffToParsedDiff';
import { loadDataset, loadDiffText, type EvalCase, type ExpectedFinding } from './lib/loadDataset';
import {
  categoryDetectionRates,
  categoryPrecisionRecall,
  matchFindings,
  type CaseMatchResult,
  type MatchPair,
} from './lib/matchFindings';
import { computeAggregateMetrics, formatNumber, formatPercent } from './lib/metrics';

type CaseResult = {
  id: string;
  negative: boolean;
  /** ok = scored; analysis_failed = findings-missed; error = runner (rate_limited not persisted as scored) */
  status: 'ok' | 'analysis_failed' | 'error';
  error?: string;
  modelUsed?: string;
  tokensUsed?: number;
  latencyMs: number;
  predicted: DetectedIssue[];
  expected: ExpectedFinding[];
  match?: CaseMatchResult;
  chunksFailed?: number;
  scoredAt?: string;
};

type CheckpointFile = {
  model: string;
  datasetVersion: string;
  startedAt: string;
  updatedAt: string;
  cases: Record<string, CaseResult>;
};

const EXIT_RESUME_TOMORROW = 3;

function resolveModel(): string {
  const argIndex = process.argv.indexOf('--model');
  if (argIndex >= 0 && process.argv[argIndex + 1]) {
    return process.argv[argIndex + 1];
  }
  if (process.env.EVAL_MODEL && process.env.EVAL_MODEL.trim()) {
    return process.env.EVAL_MODEL.trim();
  }
  return GROQ_MODEL;
}

function wantsFresh(): boolean {
  return process.argv.includes('--fresh');
}

/** Eval-only completion cap (not production). Lower = more cases per free-tier day. */
function resolveEvalMaxCompletionTokens(): number {
  const raw = process.env.EVAL_MAX_COMPLETION_TOKENS?.trim();
  if (!raw) return 2048;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 256) return 2048;
  return n;
}

function resultsDir(): string {
  return path.join(__dirname, 'results');
}

function ensureResultsDir(): void {
  const dir = resultsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function safeModelSlug(model: string): string {
  return model.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function checkpointPath(model: string): string {
  return path.join(resultsDir(), `checkpoint-${safeModelSlug(model)}.json`);
}

function isScored(result: CaseResult): boolean {
  return result.status === 'ok' || result.status === 'analysis_failed';
}

function isRateLimitedResult(result: CaseResult): boolean {
  return result.status === 'error' && Boolean(result.error?.includes('rate_limited'));
}

function loadCheckpoint(model: string, datasetVersion: string): CheckpointFile {
  const file = checkpointPath(model);
  if (wantsFresh() || !fs.existsSync(file)) {
    const now = new Date().toISOString();
    return {
      model,
      datasetVersion,
      startedAt: now,
      updatedAt: now,
      cases: {},
    };
  }
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as CheckpointFile;
  if (parsed.model !== model || parsed.datasetVersion !== datasetVersion) {
    console.warn(
      `Checkpoint model/dataset mismatch (got ${parsed.model}@${parsed.datasetVersion}); starting fresh.`,
    );
    const now = new Date().toISOString();
    return { model, datasetVersion, startedAt: now, updatedAt: now, cases: {} };
  }
  return parsed;
}

function saveCheckpoint(checkpoint: CheckpointFile): void {
  ensureResultsDir();
  checkpoint.updatedAt = new Date().toISOString();
  const file = checkpointPath(checkpoint.model);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(checkpoint, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

async function evaluateCase(
  caseItem: EvalCase,
  model: string,
  maxCompletionTokens: number,
): Promise<CaseResult> {
  const started = Date.now();
  try {
    const rawDiff = loadDiffText(caseItem);
    const parsedDiff = unifiedDiffToParsedDiff(rawDiff, {
      caseId: caseItem.id,
      prTitle: caseItem.prTitle,
      prDescription: caseItem.prDescription,
      repo: `eval/${caseItem.id}`,
      prNumber: 1,
      headSha: `eval-${caseItem.id}`,
    });

    const analysis = await groqAnalysisService.analyzeDiff(parsedDiff, undefined, {
      model,
      maxCompletionTokens,
      abortOnRateLimit: true,
    });
    const latencyMs = Date.now() - started;

    if (analysis.analysisIncomplete) {
      if (analysis.rateLimited) {
        return {
          id: caseItem.id,
          negative: caseItem.negative,
          status: 'error',
          error: `rate_limited chunksFailed=${analysis.chunksFailed ?? '?'}`,
          modelUsed: analysis.modelUsed,
          tokensUsed: analysis.tokensUsed,
          latencyMs,
          predicted: [],
          expected: caseItem.expected,
          chunksFailed: analysis.chunksFailed,
        };
      }
      const match = matchFindings([], caseItem.expected);
      return {
        id: caseItem.id,
        negative: caseItem.negative,
        status: 'analysis_failed',
        error: `analysisIncomplete chunksFailed=${analysis.chunksFailed ?? '?'}`,
        modelUsed: analysis.modelUsed,
        tokensUsed: analysis.tokensUsed,
        latencyMs,
        predicted: [],
        expected: caseItem.expected,
        match,
        chunksFailed: analysis.chunksFailed,
        scoredAt: new Date().toISOString(),
      };
    }

    const match = matchFindings(analysis.issues, caseItem.expected);

    return {
      id: caseItem.id,
      negative: caseItem.negative,
      status: 'ok',
      modelUsed: analysis.modelUsed,
      tokensUsed: analysis.tokensUsed,
      latencyMs,
      predicted: analysis.issues,
      expected: caseItem.expected,
      match,
      chunksFailed: analysis.chunksFailed,
      scoredAt: new Date().toISOString(),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const rateLimited = msg.includes('429') || msg.includes('rate_limit');
    return {
      id: caseItem.id,
      negative: caseItem.negative,
      status: 'error',
      error: rateLimited ? `rate_limited ${msg.slice(0, 200)}` : msg,
      latencyMs: Date.now() - started,
      predicted: [],
      expected: caseItem.expected,
    };
  }
}

function buildMarkdown(report: ReturnType<typeof buildReport>): string {
  const m = report.metrics;
  const lines: string[] = [];
  lines.push('# CodePulse Offline Evaluation Report');
  lines.push('');
  lines.push(`- **Timestamp:** ${report.timestamp}`);
  lines.push(`- **Model:** ${report.model}`);
  lines.push(`- **Dataset version:** ${report.datasetVersion}`);
  lines.push(
    `- **Dataset size:** ${report.datasetSize} cases (${report.positiveCases} positive, ${report.negativeCases} negative)`,
  );
  lines.push(`- **Cases succeeded:** ${report.casesOk} / ${report.datasetSize}`);
  lines.push(`- **Cases analysis-failed (tool/parse/chunk):** ${report.casesAnalysisFailed}`);
  lines.push(`- **Cases failed (runner errors):** ${report.casesErrored}`);
  lines.push('');
  lines.push(
    '_Analysis-failed cases score all expected findings as FN (findings-missed). They are not treated as successful cleans._',
  );
  lines.push('## Finding-level metrics');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---|');
  lines.push(`| TP | ${m.tp} |`);
  lines.push(`| FP | ${m.fp} |`);
  lines.push(`| FN | ${m.fn} |`);
  lines.push(`| Precision | ${formatPercent(m.precision)} |`);
  lines.push(`| Recall | ${formatPercent(m.recall)} |`);
  lines.push(`| F1 | ${formatPercent(m.f1)} |`);
  lines.push('');
  lines.push('## Clean-case (negative) results');
  lines.push('');
  lines.push(`- Clean cases: ${m.cleanCaseCount}`);
  lines.push(`- Clean cases with ≥1 finding: ${m.cleanCasesWithFindings}`);
  lines.push(`- Clean-case false-positive findings (count): ${m.cleanCaseFalsePositiveFindings}`);
  lines.push(
    `- Clean-case false-positive rate (cases with any finding / clean cases): ${formatPercent(m.cleanCaseFalsePositiveRate)}`,
  );
  lines.push('');
  lines.push('## Per-category precision / recall');
  lines.push('');
  lines.push('| Category | TP | FP | FN | Precision | Recall | F1 |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const row of m.categoryPrecisionRecall) {
    lines.push(
      `| ${row.category} | ${row.tp} | ${row.fp} | ${row.fn} | ${formatPercent(row.precision)} | ${formatPercent(row.recall)} | ${formatPercent(row.f1)} |`,
    );
  }
  lines.push('');
  lines.push('## Category detection rate');
  lines.push('');
  lines.push('| Category | Expected | Detected (TP) | Detection rate |');
  lines.push('|---|---:|---:|---:|');
  for (const row of m.categoryDetection) {
    lines.push(
      `| ${row.category} | ${row.expected} | ${row.detected} | ${formatPercent(row.detectionRate)} |`,
    );
  }
  lines.push('');
  lines.push('## Latency & tokens');
  lines.push('');
  lines.push(`- Average latency: ${formatNumber(m.averageLatencyMs, 0)} ms`);
  lines.push(`- Total latency: ${formatNumber(m.totalLatencyMs, 0)} ms`);
  lines.push(`- Average tokens: ${formatNumber(m.averageTokens, 1)}`);
  lines.push(`- Total tokens: ${m.totalTokens}`);
  lines.push('');
  lines.push('## Per-case summary');
  lines.push('');
  lines.push('| Case | Type | Status | TP | FP | FN | Latency (ms) | Tokens |');
  lines.push('|---|---|---|---:|---:|---:|---:|---:|');
  for (const c of report.cases) {
    const tp = c.match?.tp ?? 0;
    const fp = c.match?.fp ?? (c.status === 'ok' ? c.predicted.length : 0);
    const fn = c.match?.fn ?? (c.status === 'ok' ? c.expected.length : c.expected.length);
    lines.push(
      `| ${c.id} | ${c.negative ? 'clean' : 'positive'} | ${c.status}${c.error ? ` (${c.error})` : ''} | ${tp} | ${fp} | ${fn} | ${c.latencyMs} | ${c.tokensUsed ?? 0} |`,
    );
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- Results are **not deterministic**; model outputs may vary across runs.');
  lines.push('- Matching rules are documented in `eval/README.md`.');
  lines.push('- Finding-level metrics do not invent true negatives (TN).');
  lines.push(
    '- **analysis_failed** (tool parse / chunk errors): predicted findings discarded; all expected findings count as FN. Clean cases in this state do not count as successful negatives.',
  );
  lines.push('- Checkpoint/resume: `eval/results/checkpoint-<model>.json` (use `--fresh` to ignore).');
  lines.push('');
  return lines.join('\n');
}

function buildReport(datasetVersion: string, cases: CaseResult[], modelFallback: string) {
  const timestamp = new Date().toISOString();
  const okCases = cases.filter((c) => c.status === 'ok');
  const analysisFailed = cases.filter((c) => c.status === 'analysis_failed');
  const errored = cases.filter((c) => c.status === 'error');

  let tp = 0;
  let fp = 0;
  let fn = 0;
  const allTpPairs: MatchPair[] = [];
  const allExpected: ExpectedFinding[] = [];
  const allFalsePositives: DetectedIssue[] = [];
  const allFalseNegatives: ExpectedFinding[] = [];
  const latenciesMs: number[] = [];
  const tokens: number[] = [];

  let cleanCaseCount = 0;
  let cleanCasesWithFindings = 0;
  let cleanCaseFalsePositiveFindings = 0;

  for (const c of cases) {
    latenciesMs.push(c.latencyMs);
    tokens.push(c.tokensUsed ?? 0);

    if (c.status !== 'ok' || !c.match) {
      if (c.status === 'error' && c.error?.includes('rate_limited')) {
        continue;
      }
      allExpected.push(...c.expected);
      if (!c.negative) {
        fn += c.expected.length;
        allFalseNegatives.push(...c.expected);
      }
      continue;
    }

    allExpected.push(...c.expected);

    tp += c.match.tp;
    fp += c.match.fp;
    fn += c.match.fn;
    allTpPairs.push(...c.match.truePositives);
    allFalsePositives.push(...c.match.falsePositives);
    allFalseNegatives.push(...c.match.falseNegatives);

    if (c.negative) {
      cleanCaseCount += 1;
      cleanCaseFalsePositiveFindings += c.match.fp;
      if (c.match.fp > 0) {
        cleanCasesWithFindings += 1;
      }
    }
  }

  const model =
    okCases.find((c) => c.modelUsed)?.modelUsed ??
    analysisFailed.find((c) => c.modelUsed)?.modelUsed ??
    modelFallback;

  const metrics = computeAggregateMetrics({
    tp,
    fp,
    fn,
    cleanCaseCount,
    cleanCasesWithFindings,
    cleanCaseFalsePositiveFindings,
    latenciesMs,
    tokens,
    categoryDetection: categoryDetectionRates(allTpPairs, allExpected),
    categoryPrecisionRecall: categoryPrecisionRecall(
      allTpPairs,
      allFalsePositives,
      allFalseNegatives,
      allExpected,
    ),
  });

  return {
    timestamp,
    model,
    datasetVersion,
    datasetSize: cases.length,
    positiveCases: cases.filter((c) => !c.negative).length,
    negativeCases: cases.filter((c) => c.negative).length,
    casesOk: okCases.length,
    casesAnalysisFailed: analysisFailed.length,
    casesErrored: errored.length,
    metrics,
    cases,
  };
}

function writeFinalReports(
  model: string,
  datasetVersion: string,
  orderedResults: CaseResult[],
): void {
  const report = buildReport(datasetVersion, orderedResults, model);
  ensureResultsDir();
  const slug = safeModelSlug(model);
  const jsonPath = path.join(resultsDir(), `latest-${slug}.json`);
  const mdPath = path.join(resultsDir(), `latest-${slug}.md`);
  const latestJson = path.join(resultsDir(), 'latest.json');
  const latestMd = path.join(resultsDir(), 'latest.md');
  const json = JSON.stringify(report, null, 2);
  const md = buildMarkdown(report);
  fs.writeFileSync(jsonPath, json, 'utf8');
  fs.writeFileSync(mdPath, md, 'utf8');
  fs.writeFileSync(latestJson, json, 'utf8');
  fs.writeFileSync(latestMd, md, 'utf8');

  console.log('\n=== Aggregate metrics ===');
  console.log(`Model=${report.model}`);
  console.log(`TP=${report.metrics.tp} FP=${report.metrics.fp} FN=${report.metrics.fn}`);
  console.log(
    `Precision=${formatPercent(report.metrics.precision)} Recall=${formatPercent(report.metrics.recall)} F1=${formatPercent(report.metrics.f1)}`,
  );
  console.log(
    `analysis_failed=${report.casesAnalysisFailed} runner_errors=${report.casesErrored}`,
  );
  console.log(
    `Clean FP rate (case-level)=${formatPercent(report.metrics.cleanCaseFalsePositiveRate)} (${report.metrics.cleanCasesWithFindings}/${report.metrics.cleanCaseCount})`,
  );
  console.log('\nPer-category P/R:');
  for (const row of report.metrics.categoryPrecisionRecall) {
    console.log(
      `  ${row.category}: P=${formatPercent(row.precision)} R=${formatPercent(row.recall)} F1=${formatPercent(row.f1)} (tp=${row.tp} fp=${row.fp} fn=${row.fn})`,
    );
  }
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(`Also wrote ${latestJson} / ${latestMd}`);
}

async function main(): Promise<void> {
  const model = resolveModel();
  const maxCompletionTokens = resolveEvalMaxCompletionTokens();
  const dataset = loadDataset();
  ensureResultsDir();

  const checkpoint = loadCheckpoint(model, dataset.version);
  const scoredIds = Object.values(checkpoint.cases).filter(isScored).map((c) => c.id);
  const remaining = dataset.cases.filter((c) => !checkpoint.cases[c.id] || !isScored(checkpoint.cases[c.id]));

  console.log(
    `Loaded dataset v${dataset.version} with ${dataset.cases.length} cases. Model=${model}`,
  );
  console.log(
    `Checkpoint: ${scoredIds.length} scored, ${remaining.length} remaining. Eval max_tokens=${maxCompletionTokens} (eval-only).`,
  );
  console.log('On Groq rate limit: stop cleanly — re-run tomorrow to resume.\n');

  for (const caseItem of remaining) {
    process.stdout.write(`Evaluating ${caseItem.id}... `);
    const result = await evaluateCase(caseItem, model, maxCompletionTokens);

    if (isRateLimitedResult(result)) {
      console.log(`RATE_LIMITED — stopping.`);
      console.error(
        `\nRESUME TOMORROW: free-tier Groq TPD hit after ${scoredIds.length} scored cases.`,
      );
      console.error(
        `Checkpoint saved at ${checkpointPath(model)} (${Object.values(checkpoint.cases).filter(isScored).length} scored).`,
      );
      console.error(`Re-run the same command tomorrow; already-scored cases will be skipped.`);
      console.error(`Exit code ${EXIT_RESUME_TOMORROW}.`);
      process.exit(EXIT_RESUME_TOMORROW);
    }

    if (result.status === 'error') {
      console.log(`ERROR: ${result.error}`);
      // Persist non-rate-limit errors so we don't retry forever; operator can --fresh.
      checkpoint.cases[caseItem.id] = { ...result, scoredAt: new Date().toISOString() };
      saveCheckpoint(checkpoint);
      continue;
    }

    if (result.status === 'analysis_failed') {
      console.log(
        `ANALYSIS_FAILED tp=${result.match?.tp ?? 0} fp=${result.match?.fp ?? 0} fn=${result.match?.fn ?? result.expected.length} ${result.latencyMs}ms (${result.error})`,
      );
    } else {
      console.log(
        `ok tp=${result.match?.tp ?? 0} fp=${result.match?.fp ?? 0} fn=${result.match?.fn ?? 0} ${result.latencyMs}ms tokens=${result.tokensUsed ?? 0}`,
      );
    }

    checkpoint.cases[caseItem.id] = result;
    saveCheckpoint(checkpoint);
    scoredIds.push(caseItem.id);
  }

  const orderedResults = dataset.cases.map((c) => {
    const stored = checkpoint.cases[c.id];
    if (!stored || !isScored(stored)) {
      throw new Error(`Missing scored result for ${c.id} after run — checkpoint corrupt?`);
    }
    return stored;
  });

  writeFinalReports(model, dataset.version, orderedResults);
  console.log(`\nSuite complete. Checkpoint kept at ${checkpointPath(model)} (use --fresh to discard).`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
