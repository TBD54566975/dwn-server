import { assert } from 'chai';
import { createProfile } from './utils.js';
import { Jws } from '@tbd54566975/dwn-sdk-js';
import type { SubscriptionController } from '../src/subscription-manager.js';
import { SubscriptionManager } from '../src/subscription-manager.js';

describe('Subscription Manager Test', () => {
  let subscriptionManager: SubscriptionController;

  // important to follow the `before` and `after` pattern to initialize and clean the stores in tests
  // so that different test suites can reuse the same backend store for testing
  before(async () => {
    subscriptionManager = new SubscriptionManager({});
  });

  // before each, clear the subscriptions
  beforeEach(async () => {
    subscriptionManager.clear();
  });

  // close at the end
  after(async () => {
    await subscriptionManager.close();
  });

  it('test subscription manager registration', async () => {
    try {
      const alice = await createProfile();
      const req = await SubscriptionRequest.create({
        filter: {
          eventType: EventType.Operation,
        },
        authorizationSignatureInput: Jws.createSignatureInput(alice),
      });
      const subscription = await subscriptionManager.subscribe({
        from: alice.did,
        subscriptionRequestMessage: req,
        permissionGrant: 'asdf',
      });
      assert.isDefined(subscription.reply);
      assert.isDefined(subscription.subscriptionId);
    } catch (error) {
      assert.fail(error, undefined, 'failed to register subscription');
    }
  });
});
