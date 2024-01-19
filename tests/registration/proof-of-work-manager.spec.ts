

import sinon from 'sinon';

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

  it('should continue to periodically refresh the challenge nonce and proof-of-work difficulty even if the refresh logic throws error.', async function () {
    const desiredSolveCountPerMinute = 10;
    const initialMaximumAllowedHashValue = 'FFFFFFFF';
    const proofOfWorkManager = await ProofOfWorkManager.create({
      autoStart: true,
      desiredSolveCountPerMinute,
      initialMaximumAllowedHashValue,
    });

    // stub that throws half the time
    const stub = (): void => {
      // Generate a random number between 0 and 1
      const random = Math.random();
    
      // If the random number is less than 0.5, throw an error
      if (random < 0.5) {
        throw new Error('Random error');
      }
    };

    const challengeNonceRefreshSpy = sinon.stub(proofOfWorkManager, 'refreshChallengeNonce').callsFake(stub);
    const maximumAllowedHashValueRefreshSpy = sinon.stub(proofOfWorkManager, 'refreshMaximumAllowedHashValue').callsFake(stub);

    clock.tick(60 * 60 * 1000);

    // 1 hour divided by the challenge refresh frequency
    const expectedChallengeNonceRefreshCount = 60 * 60 / proofOfWorkManager.challengeRefreshFrequencyInSeconds;

    // 1 hour divided by the challenge refresh frequency
    const expectedDifficultyReevaluationCount = 60 * 60 / proofOfWorkManager.difficultyReevaluationFrequencyInSeconds;

    expect(challengeNonceRefreshSpy.callCount).to.greaterThanOrEqual(expectedChallengeNonceRefreshCount);
    expect(maximumAllowedHashValueRefreshSpy.callCount).to.greaterThanOrEqual(expectedDifficultyReevaluationCount);
  });

  it('should increase difficulty if proof-of-work rate goes above desired rate and reduce difficulty as proof-of-work rate falls below desired rate.', async function () {
    const desiredSolveCountPerMinute = 10;
    const initialMaximumAllowedHashValue = 'FFFFFFFF';
    const proofOfWorkManager = await ProofOfWorkManager.create({
      autoStart: true,
      desiredSolveCountPerMinute,
      initialMaximumAllowedHashValue,
    });

    // Load up desiredSolveRatePerMinute number of proof-of-work entries, so all future new entries will increase the complexity.
    for (let i = 0; i < desiredSolveCountPerMinute; i++) {
      await proofOfWorkManager.recordProofOfWork(uuidv4());
    }

    let baselineMaximumAllowedHashValue = proofOfWorkManager.currentMaximumAllowedHashValue;
    let lastMaximumAllowedHashValue = BigInt('0x' + initialMaximumAllowedHashValue);
    const lastSolveCountPerMinute = 0;
    for (let i = 0; i < 100; i++) {
      // Simulating 1 proof-of-work per second for 100 seconds.
      await proofOfWorkManager.recordProofOfWork(uuidv4());
      expect(proofOfWorkManager.currentSolveCountPerMinute).to.be.greaterThanOrEqual(lastSolveCountPerMinute);
      clock.tick(1000);

      // The maximum allowed hash value should be monotonically decreasing as more proof-of-work is submitted.
      expect(proofOfWorkManager.currentMaximumAllowedHashValue <= lastMaximumAllowedHashValue).to.be.true;
      lastMaximumAllowedHashValue = proofOfWorkManager.currentMaximumAllowedHashValue;
    }
    expect(proofOfWorkManager.currentMaximumAllowedHashValue < baselineMaximumAllowedHashValue).to.be.true;

    // Simulated 100 seconds has passed, so all proof-of-work entries should be removed.
    clock.tick(100_000);
    clock.runToLast();

    expect(proofOfWorkManager.currentSolveCountPerMinute).to.equal(0);

    baselineMaximumAllowedHashValue = proofOfWorkManager.currentMaximumAllowedHashValue;
    for (let i = 0; i < 100; i++) {
      // Simulating no proof-of-work load for 100 seconds.
      clock.tick(1000);

      // The maximum allowed hash value should be monotonically increasing again.
      expect(proofOfWorkManager.currentMaximumAllowedHashValue >= lastMaximumAllowedHashValue).to.be.true;
      lastMaximumAllowedHashValue = proofOfWorkManager.currentMaximumAllowedHashValue;
    }
    expect(proofOfWorkManager.currentMaximumAllowedHashValue > baselineMaximumAllowedHashValue).to.be.true;
  });

  it('should reduce difficulty back to initial difficulty when proof-of-work rate is lower than desired rate for long enough', async function () {
    const desiredSolveCountPerMinute = 10;
    const initialMaximumAllowedHashValue = 'FFFFFFFF';
    const initialMaximumAllowedHashValueAsBigInt = BigInt('0x' + initialMaximumAllowedHashValue);
    const proofOfWorkManager = await ProofOfWorkManager.create({
      autoStart: true,
      desiredSolveCountPerMinute,
      initialMaximumAllowedHashValue,
    });

    // Load up desiredSolveRatePerMinute number of proof-of-work entries, so all future new entries will increase the complexity.
    for (let i = 0; i < desiredSolveCountPerMinute; i++) {
      await proofOfWorkManager.recordProofOfWork(uuidv4());
    }

    // Simulating 1 proof-of-work per second for 100 seconds to increase proof-of-work difficulty.
    for (let i = 0; i < 100; i++) {
      await proofOfWorkManager.recordProofOfWork(uuidv4());
      clock.tick(1000);
    }
    expect(proofOfWorkManager.currentMaximumAllowedHashValue < initialMaximumAllowedHashValueAsBigInt).to.be.true;

    // Simulated 1 hour has passed.
    clock.tick(60 * 60 * 1000);
    clock.runToLast();

    expect(proofOfWorkManager.currentMaximumAllowedHashValue === initialMaximumAllowedHashValueAsBigInt).to.be.true;
  });

  it('should use default difficulty if not given', async function () {
    const desiredSolveCountPerMinute = 10;
    const proofOfWorkManager = await ProofOfWorkManager.create({
      autoStart: false,
      desiredSolveCountPerMinute,
    });

    expect(proofOfWorkManager.currentMaximumAllowedHashValue).to.equal(BigInt('0x' + ProofOfWorkManager.defaultMaximumAllowedHashValue));
  });
});
