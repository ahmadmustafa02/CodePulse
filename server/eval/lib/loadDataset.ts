/** Load and validate the offline evaluation dataset (cases.json + unified diffs). */

import fs from 'fs';
import path from 'path';
import { z } from 'zod';

const ISSUE_CATEGORIES = [
  'security',
  'performance',
  'error-handling',
  'code-quality',
  'type-safety',
  'logic',
  'best-practices',
] as const;

const ISSUE_SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;

const expectedFindingSchema = z.object({
  id: z.string().min(1),
  file: z.string().min(1),
  line: z.number().int().positive(),
  lineTolerance: z.number().int().nonnegative().default(1),
  category: z.enum(ISSUE_CATEGORIES),
  severityMin: z.enum(ISSUE_SEVERITIES).optional(),
  keywords: z.array(z.string().min(1)).default([]),
});

const caseSchema = z.object({
  id: z.string().min(1),
  language: z.string().min(1),
  prTitle: z.string(),
  prDescription: z.string().default(''),
  diffPath: z.string().min(1),
  negative: z.boolean(),
  expected: z.array(expectedFindingSchema),
});

const datasetSchema = z.object({
  version: z.string(),
  cases: z.array(caseSchema).min(1),
});

export type ExpectedFinding = z.infer<typeof expectedFindingSchema>;
export type EvalCase = z.infer<typeof caseSchema> & { diffAbsolutePath: string };
export type Dataset = {
  version: string;
  cases: EvalCase[];
  datasetRoot: string;
};

export function getDatasetRoot(): string {
  return path.join(__dirname, '..', 'dataset');
}

export function loadDataset(datasetRoot: string = getDatasetRoot()): Dataset {
  const casesPath = path.join(datasetRoot, 'cases.json');
  const raw = fs.readFileSync(casesPath, 'utf8');
  const parsedJson: unknown = JSON.parse(raw);
  const validated = datasetSchema.safeParse(parsedJson);

  if (!validated.success) {
    const message = validated.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid dataset cases.json: ${message}`);
  }

  const cases: EvalCase[] = validated.data.cases.map((c) => {
    if (c.negative && c.expected.length > 0) {
      throw new Error(`Case ${c.id}: negative cases must have expected: []`);
    }
    if (!c.negative && c.expected.length === 0) {
      throw new Error(`Case ${c.id}: positive cases must have at least one expected finding`);
    }

    const diffAbsolutePath = path.join(datasetRoot, c.diffPath);
    if (!fs.existsSync(diffAbsolutePath)) {
      throw new Error(`Case ${c.id}: missing diff file at ${diffAbsolutePath}`);
    }

    return { ...c, diffAbsolutePath };
  });

  return {
    version: validated.data.version,
    cases,
    datasetRoot,
  };
}

export function loadDiffText(caseItem: EvalCase): string {
  return fs.readFileSync(caseItem.diffAbsolutePath, 'utf8');
}
