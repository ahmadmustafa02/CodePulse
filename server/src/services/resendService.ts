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
}

export const resendService = new ResendService();
