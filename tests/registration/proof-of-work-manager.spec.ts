

import { expect } from 'chai';
import { useFakeTimers } from 'sinon';
import { v4 as uuidv4 } from 'uuid';
import { ProofOfWorkManager } from '../..//src/registration/proof-of-work-manager.js';


describe('ProofOfWorkManager', function () {
  let clock;

  before(async function () {
    clock = useFakeTimers({ shouldAdvanceTime: true });
  });

  beforeEach(async function () {
  });

  afterEach(async function () {
  });

  after(function () {
    clock.restore();
  });

  describe('complexity', function () {

    it('should become more complex as more successful proof-of-work is submitted', async function () {
      const desiredSolveRatePerMinute = 10;
      const initialMaximumHashValue = 'FFFFFFFF';
      const proofOfWorkManager = await ProofOfWorkManager.create(desiredSolveRatePerMinute, initialMaximumHashValue);

      // Load up desiredSolveRatePerMinute number of proof-of-work entries, so all future new entries will increase the complexity.
      for (let i = 0; i < desiredSolveRatePerMinute; i++) {
        await proofOfWorkManager.recordProofOfWork(uuidv4());
      }

      let lastMaximumAllowedHashValue = BigInt('0x' + initialMaximumHashValue);
      for (let i = 0; i < 100; i++) {
        // Simulating 1 proof-of-work per second which is ~60/min for 100 seconds.
        clock.tick(1000);
        await proofOfWorkManager.recordProofOfWork(uuidv4());
        await proofOfWorkManager.refreshMaximumAllowedHashValue();

        // The maximum allowed hash value should be decreasing as more proof-of-work is submitted.
        expect(proofOfWorkManager.currentMaximumAllowedHashValue < lastMaximumAllowedHashValue).to.be.true;
        lastMaximumAllowedHashValue = proofOfWorkManager.currentMaximumAllowedHashValue;
      }

      // Simulated 100 seconds has passed, so all proof-of-work entries should be removed.
      clock.tick(100_000);

      for (let i = 0; i < 100; i++) {
        // Simulating no proof-of-work load for 100 seconds.
        clock.tick(1000);
        await proofOfWorkManager.refreshMaximumAllowedHashValue();

        // The maximum allowed hash value should be increasing again.
        expect(proofOfWorkManager.currentMaximumAllowedHashValue > lastMaximumAllowedHashValue).to.be.true;
        lastMaximumAllowedHashValue = proofOfWorkManager.currentMaximumAllowedHashValue;
      }
    });
  });
});
