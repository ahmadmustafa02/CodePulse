/** Augments Express Locals with GitHub webhook metadata from middleware. */

export type WebhookLocals = {
  eventType: string;
  deliveryId: string;
};

declare global {
  namespace Express {
    interface Locals {
      eventType?: string;
      deliveryId?: string;
    }
  }
}

export {};
