/** Generates HTML and subject lines for weekly developer digest emails. */

import type { DeveloperDigest } from '../types/digest';

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
};

function formatDateRange(weekStart: Date, weekEnd: Date): string {
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${weekStart.toLocaleDateString('en-US', options)} – ${weekEnd.toLocaleDateString('en-US', options)}`;
}

function renderSeverityBadges(issuesBySeverity: Record<string, number>): string {
  const entries = Object.entries(issuesBySeverity);
  if (entries.length === 0) {
    return '<p style="margin:0;color:#6b7280;">No issues by severity.</p>';
  }

  return entries
    .map(
      ([severity, count]) =>
        `<span style="display:inline-block;margin:4px 8px 4px 0;padding:6px 12px;border-radius:9999px;background:${SEVERITY_COLORS[severity] ?? '#6b7280'};color:#fff;font-size:13px;font-weight:600;text-transform:uppercase;">${severity}: ${count}</span>`,
    )
    .join('');
}

function renderCategoryTable(issuesByCategory: Record<string, number>): string {
  const entries = Object.entries(issuesByCategory);
  if (entries.length === 0) {
    return '<p style="margin:0;color:#6b7280;">No issues by category.</p>';
  }

  const rows = entries
    .map(
      ([category, count]) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${category}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${count}</td></tr>`,
    )
    .join('');

  return `<table style="width:100%;border-collapse:collapse;font-size:14px;"><thead><tr><th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;color:#374151;">Category</th><th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e5e7eb;color:#374151;">Count</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderTopFiles(topFiles: Array<{ file: string; count: number }>): string {
  if (topFiles.length === 0) {
    return '<p style="margin:0;color:#6b7280;">No file hotspots this week.</p>';
  }

  return topFiles
    .map(
      (entry) =>
        `<p style="margin:0 0 8px;font-family:monospace;font-size:13px;color:#111827;"><strong>${entry.count}</strong> issue(s) in <code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;">${entry.file}</code></p>`,
    )
    .join('');
}

function renderIssuesBody(digest: DeveloperDigest, weekRange: string): string {
  return `
    <p style="margin:0 0 16px;font-size:16px;color:#111827;">Week of ${weekRange}</p>
    <div style="margin-bottom:24px;padding:16px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Summary</p>
      <p style="margin:0;font-size:28px;font-weight:700;color:#111827;">${digest.totalIssues} issue(s) found</p>
    </div>
    <div style="margin-bottom:24px;">
      <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#111827;">Issues by severity</p>
      ${renderSeverityBadges(digest.issuesBySeverity)}
    </div>
    <div style="margin-bottom:24px;">
      <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#111827;">Issues by category</p>
      ${renderCategoryTable(digest.issuesByCategory)}
    </div>
    <div style="margin-bottom:24px;">
      <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#111827;">Top files</p>
      ${renderTopFiles(digest.topFiles)}
    </div>`;
}

function renderCleanWeekBody(weekRange: string): string {
  return `
    <p style="margin:0 0 16px;font-size:16px;color:#111827;">Week of ${weekRange}</p>
    <div style="padding:24px;background:#ecfdf5;border-radius:8px;border:1px solid #a7f3d0;text-align:center;">
      <p style="margin:0;font-size:20px;font-weight:700;color:#047857;">Congratulations!</p>
      <p style="margin:12px 0 0;font-size:15px;color:#065f46;">No issues were flagged in your PRs this week. Keep up the great work.</p>
    </div>`;
}

export function generateDigestSubject(digest: DeveloperDigest): string {
  if (digest.totalIssues === 0) {
    return 'CodePulse Weekly Review — Clean week! 🎉';
  }
  return `CodePulse Weekly Review — ${digest.totalIssues} issues found this week`;
}

export function generateDigestEmail(digest: DeveloperDigest): string {
  const weekRange = formatDateRange(digest.weekStart, digest.weekEnd);
  const bodyContent =
    digest.totalIssues === 0 ? renderCleanWeekBody(weekRange) : renderIssuesBody(digest, weekRange);

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:#1a1a2e;padding:24px 32px;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">CodePulse</p>
              <p style="margin:8px 0 0;font-size:14px;color:#a5b4fc;">Weekly Code Review Digest</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${bodyContent}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;">You're receiving this because your team uses CodePulse</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
