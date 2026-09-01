/**
 * Pre-flight smoke check for the offline eval harness.
 * Loads the dataset and parses every unified diff into ParsedDiff — no Groq calls.
 *
 * Usage (from server/): npm run eval:smoke
 */

import { unifiedDiffToParsedDiff } from './lib/diffToParsedDiff';
import { loadDataset, loadDiffText } from './lib/loadDataset';

function main(): void {
  const dataset = loadDataset();
  let totalFiles = 0;

  for (const caseItem of dataset.cases) {
    const rawDiff = loadDiffText(caseItem);
    const parsed = unifiedDiffToParsedDiff(rawDiff, {
      caseId: caseItem.id,
      prTitle: caseItem.prTitle,
      prDescription: caseItem.prDescription,
      repo: `eval/${caseItem.id}`,
      prNumber: 1,
      headSha: `eval-${caseItem.id}`,
    });

    if (parsed.files.length === 0) {
      throw new Error(`Case ${caseItem.id}: parsed zero files from ${caseItem.diffPath}`);
    }

    totalFiles += parsed.files.length;
    console.log(
      `ok ${caseItem.id} (${caseItem.negative ? 'clean' : 'positive'}) files=${parsed.files.length} +${parsed.totalAdditions}/-${parsed.totalDeletions}`,
    );
  }

  const positive = dataset.cases.filter((c) => !c.negative).length;
  const negative = dataset.cases.filter((c) => c.negative).length;

  console.log('\n=== Eval smoke OK ===');
  console.log(
    `dataset v${dataset.version}: ${dataset.cases.length} cases (${positive} positive, ${negative} clean), ${totalFiles} parsed files`,
  );
  console.log('Full LLM eval: npm run eval:offline (requires GROQ_API_KEY + full .env)');
}

try {
  main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
