/** Sends digest emails via the Resend API. */

import { Resend } from 'resend';
import { env } from '../config/env';
import logger from '../utils/logger';

type SendDigestEmailParams = {
  to: string;
  subject: string;
  html: string;
  developerLogin: string;
};

type CriticalEscalationFindingPreview = {
  title: string;
  file: string;
  line: number;
  category: string;
};

type SendCriticalEscalationAlertParams = {
  to: string;
  repoFullName: string;
  prNumber: number;
  prTitle: string;
  prAuthorLogin: string;
  findingCount: number;
  findings: CriticalEscalationFindingPreview[];
  headline: string;
  subjectPrefix: string;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class ResendService {
  private readonly resend: Resend;

  constructor() {
    this.resend = new Resend(env.RESEND_API_KEY);
  }

  async sendDigestEmail(params: SendDigestEmailParams): Promise<void> {
    try {
      await this.resend.emails.send({
        from: env.DIGEST_FROM_EMAIL,
        to: params.to,
        subject: params.subject,
        html: params.html,
      });

      logger.info('Digest email sent', { developerLogin: params.developerLogin });
    } catch (error) {
      logger.error('Failed to send digest email', {
        developerLogin: params.developerLogin,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /** Urgent CRITICAL-severity alert to team lead; swallows Resend errors so callers never throw. */
  async sendCriticalEscalationAlert(params: SendCriticalEscalationAlertParams): Promise<void> {
    try {
      const listItems = params.findings
        .map(
          (f) =>
            `<li style="margin:8px 0;"><span style="color:#71717a;font-size:11px;text-transform:uppercase;">${escapeHtml(f.category)}</span><br/><strong>${escapeHtml(f.title)}</strong><br/><span style="color:#444;">${escapeHtml(f.file)}:${f.line}</span></li>`,
        )
        .join('');

      const html = `<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;background:#f4f4f5;padding:24px;">
  <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
    <tr><td style="background:#b91c1c;color:#fff;padding:20px 24px;">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;">${escapeHtml(params.headline)}</div>
      <div style="font-size:20px;font-weight:700;margin-top:6px;">PR ${escapeHtml(params.repoFullName)}#${params.prNumber}</div>
      <div style="font-size:14px;opacity:.95;margin-top:4px;">${escapeHtml(params.prTitle)}</div>
    </td></tr>
    <tr><td style="padding:24px;">
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5;"><strong>${params.findingCount}</strong> critical-severity finding(s) from the Antigravity review require immediate attention.</p>
      <p style="margin:0 0 16px;font-size:14px;color:#444;">Author: <strong>@${escapeHtml(params.prAuthorLogin)}</strong></p>
      <div style="border:1px solid #e4e4e7;border-radius:8px;padding:12px 16px;background:#fafafa;">
        <div style="font-size:12px;font-weight:600;color:#71717a;margin-bottom:8px;">Top findings</div>
        <ul style="margin:0;padding-left:18px;">${listItems}</ul>
      </div>
      <p style="margin:20px 0 0;font-size:13px;color:#71717a;">This message was sent because escalation is enabled for this repository in CodePulse.</p>
    </td></tr>
  </table>
</body></html>`;

      await this.resend.emails.send({
        from: env.DIGEST_FROM_EMAIL,
        to: params.to,
        subject: `${params.subjectPrefix} ${params.repoFullName}#${params.prNumber}`,
        html,
      });

      logger.info('Critical escalation alert sent', { to: params.to, prNumber: params.prNumber });
    } catch (error) {
      logger.error('Critical escalation alert failed', {
        to: params.to,
        prNumber: params.prNumber,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }
}

export const resendService = new ResendService();
