/** Formats DetectedIssue objects into GitHub markdown for PR review comments. */

import type { DetectedIssue, IssueSeverity } from '../types/analysis';

const SEVERITY_EMOJI: Record<IssueSeverity, string> = {
  critical: '🚨',
  high: '⚠️',
  medium: '💡',
  low: 'ℹ️',
};

const EXTENSION_LANGUAGE_MAP: Array<{ suffix: string; language: string }> = [
  { suffix: '.tsx', language: 'typescript' },
  { suffix: '.ts', language: 'typescript' },
  { suffix: '.jsx', language: 'javascript' },
  { suffix: '.js', language: 'javascript' },
  { suffix: '.py', language: 'python' },
  { suffix: '.go', language: 'go' },
  { suffix: '.rs', language: 'rust' },
];

function inferLanguage(filename: string): string {
  const lower = filename.toLowerCase();
  const match = EXTENSION_LANGUAGE_MAP.find(({ suffix }) => lower.endsWith(suffix));
  return match?.language ?? 'plaintext';
}

export function formatIssueComment(issue: DetectedIssue, jobId?: string): string {
  const emoji = SEVERITY_EMOJI[issue.severity];
  const language = inferLanguage(issue.file);
  const marker = jobId ? `\n\n<!-- codepulse-job:${jobId} -->` : '';

  return `---
## ${emoji} [${issue.severity.toUpperCase()}] ${issue.title}

**Category:** ${issue.category}

**Problem:** ${issue.explanation}

**Suggestion:** ${issue.suggestion}

\`\`\`${language}
${issue.codeSnippet}
\`\`\`

---
*🤖 CodePulse AI Review*${marker}`;
}

function countBySeverity(issues: DetectedIssue[]): Record<IssueSeverity, number> {
  return issues.reduce<Record<IssueSeverity, number>>(
    (counts, issue) => {
      counts[issue.severity] += 1;
      return counts;
    },
    { critical: 0, high: 0, medium: 0, low: 0 },
  );
}

function buildSeverityTableRows(counts: Record<IssueSeverity, number>): string {
  const rows: Array<{ emoji: string; label: string; count: number }> = [
    { emoji: '🚨', label: 'Critical', count: counts.critical },
    { emoji: '⚠️', label: 'High', count: counts.high },
    { emoji: '💡', label: 'Medium', count: counts.medium },
    { emoji: 'ℹ️', label: 'Low', count: counts.low },
  ];

  return rows
    .filter((row) => row.count > 0)
    .map((row) => `| ${row.emoji} ${row.label} | ${row.count} |`)
    .join('\n');
}

export function formatReviewSummary(
  issues: DetectedIssue[],
  repo: string,
  prNumber: number,
  jobId?: string,
): string {
  const marker = jobId ? `\n\n<!-- codepulse-job:${jobId} -->` : '';
  const header = `## 🔍 CodePulse AI Review Complete

Analyzed **${repo}** PR #${prNumber}`;

  if (issues.length === 0) {
    return `${header}

✅ **No issues found.** This PR looks good!

---
*🤖 Powered by CodePulse — AI-powered code review*${marker}`;
  }

  const counts = countBySeverity(issues);
  const tableRows = buildSeverityTableRows(counts);

  return `${header}

Found **${issues.length} issue(s)** that need attention:

| Severity | Count |
|----------|-------|
${tableRows}

> Issues are posted as inline comments on the relevant lines.

---
*🤖 Powered by CodePulse — AI-powered code review*${marker}`;
}

export function codePulseJobMarker(jobId: string): string {
  return `<!-- codepulse-job:${jobId} -->`;
}
