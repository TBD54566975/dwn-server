import type { MessageSubscription } from "@tbd54566975/dwn-sdk-js";

import { DwnServerError, DwnServerErrorCode } from "./dwn-error.js";

/**
 * SubscriptionManager manages the subscriptions related to a `SocketConnection`
 */
export interface SubscriptionManager {
  subscribe: (target: string, subscription: MessageSubscription) => Promise<void>;
  close: (target: string, id: string) => Promise<void>;
  closeAll: () => Promise<void>;
}

export class InMemorySubscriptionManager implements SubscriptionManager {
  constructor(private subscriptions: Map<string, Map<string, MessageSubscription>> = new Map()){};
  async subscribe(target: string, subscription: MessageSubscription): Promise<void> {
    let targetSubscriptions = this.subscriptions.get(target);
    if (targetSubscriptions === undefined) {
      targetSubscriptions = new Map();
      this.subscriptions.set(target, targetSubscriptions);
    }
    targetSubscriptions.set(subscription.id, subscription);
  }

  async close(target: string, id: string): Promise<void> {
    const targetSubscriptions = this.subscriptions.get(target);
    if (targetSubscriptions !== undefined) {
      const subscription = targetSubscriptions.get(id);
      if (subscription !== undefined) {
        targetSubscriptions.delete(id);
        await subscription.close();
        return;
      }
    }

    // if it reached here no subscription to close
    throw new DwnServerError(
      DwnServerErrorCode.SubscriptionManagerSubscriptionNotFound,
      `subscription ${id} was not found`
    )
  }

  async closeAll(): Promise<void> {
    const closePromises = [];
    for (const [target, subscriptions] of this.subscriptions) {
      this.subscriptions.delete(target);
      for (const [id, subscription] of subscriptions) {
        subscriptions.delete(id);
        closePromises.push(subscription.close());
      }
    }

    await Promise.all(closePromises);
  }
}