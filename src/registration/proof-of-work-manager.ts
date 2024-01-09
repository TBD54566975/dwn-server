import { DwnServerError, DwnServerErrorCode } from "../dwn-error.js";
import type { ProofOfWorkChallengeModel } from "./proof-of-work-types.js";
import { ProofOfWork } from "./proof-of-work.js";

export class ProofOfWorkManager {
  private challengeNonces: { currentChallengeNonce: string, previousChallengeNonce?: string };
  private proofOfWorkOfLastMinute: Map<string, number> = new Map(); // proofOfWorkId -> timestamp of proof-of-work
  private currentMaximumHashValueAsBigInt: bigint;
  private initialMaximumHashValueAsBigInt: bigint;
  private desiredSolveCountPerMinute: number;

  public challengeRefreshFrequencyInSeconds: number;
  public difficultyReevaluationFrequencyInSeconds: number;

  public get currentMaximumAllowedHashValue(): bigint {
    return this.currentMaximumHashValueAsBigInt;
  }

  public get currentSolveCountPerMinute(): number {
    return this.proofOfWorkOfLastMinute.size;
  }

  private constructor (input: {
    desiredSolveCountPerMinute: number,
    initialMaximumHashValue: string,
    challengeRefreshFrequencyInSeconds: number,
    difficultyReevaluationFrequencyInSeconds: number
  }) {
    const { desiredSolveCountPerMinute, initialMaximumHashValue } = input;

    this.challengeNonces = { currentChallengeNonce: ProofOfWork.generateNonce() };
    this.currentMaximumHashValueAsBigInt = BigInt(`0x${initialMaximumHashValue}`);
    this.initialMaximumHashValueAsBigInt = BigInt(`0x${initialMaximumHashValue}`);
    this.desiredSolveCountPerMinute = desiredSolveCountPerMinute;
    this.challengeRefreshFrequencyInSeconds = input.challengeRefreshFrequencyInSeconds;
    this.difficultyReevaluationFrequencyInSeconds = input.difficultyReevaluationFrequencyInSeconds;
  }

  public static async create(input: {
    desiredSolveCountPerMinute: number,
    initialMaximumHashValue: string,
    autoStart: boolean,
    challengeRefreshFrequencyInSeconds?: number,
    difficultyReevaluationFrequencyInSeconds?: number
  }): Promise<ProofOfWorkManager> {
    const { desiredSolveCountPerMinute, initialMaximumHashValue } = input;

    const challengeRefreshFrequencyInSeconds = input.challengeRefreshFrequencyInSeconds ?? 10 * 60; // 10 minutes default
    const difficultyReevaluationFrequencyInSeconds = input.difficultyReevaluationFrequencyInSeconds ?? 10; // 10 seconds default

    const proofOfWorkManager = new ProofOfWorkManager({
      desiredSolveCountPerMinute,
      initialMaximumHashValue,
      challengeRefreshFrequencyInSeconds,
      difficultyReevaluationFrequencyInSeconds
    });

    if (input.autoStart) {
      proofOfWorkManager.start();
    }

    return proofOfWorkManager;
  }

  public getProofOfWorkChallenge(): ProofOfWorkChallengeModel {
    return {
      challengeNonce: this.challengeNonces.currentChallengeNonce,
      maximumAllowedHashValue: ProofOfWorkManager.bigIntToHexString(this.currentMaximumAllowedHashValue),
    };
  }

  /**
   * Converts a BigInt to a 256 bit HEX string with padded preceding zeros (64 characters).
   */
  private static bigIntToHexString (int: BigInt): string {
    let hex = int.toString(16).toUpperCase();
    const stringLength = hex.length;
    for (let pad = stringLength; pad < 64; pad++) {
      hex = '0' + hex;
    }
    return hex;
  }

  public static isHexString(str: string): boolean {
    const regexp = /^[0-9a-fA-F]+$/;
    return regexp.test(str);
  }

  public async verifyProofOfWork(proofOfWork: {
    challengeNonce: string;
    responseNonce: string;
    requestData: string;
  }): Promise<void> {
    const { challengeNonce, responseNonce, requestData } = proofOfWork;

    // Verify response nonce is a HEX string that represents a 256 bit value.
    if (!ProofOfWorkManager.isHexString(responseNonce) || responseNonce.length !== 64) {
      throw new DwnServerError(
        DwnServerErrorCode.ProofOfWorkManagerInvalidResponseNonceFormat,
        `Response nonce not a HEX string representing a 256 bit value: ${responseNonce}.`
      );
    }

    // Verify challenge nonce is valid.
    if (challengeNonce !== this.challengeNonces.currentChallengeNonce &&
        challengeNonce !== this.challengeNonces.previousChallengeNonce) {
      throw new DwnServerError(
        DwnServerErrorCode.ProofOfWorkManagerInvalidChallengeNonce,
        `Unknown or expired challenge nonce: ${challengeNonce}.`
      );
    }

    const maximumAllowedHashValue = this.currentMaximumAllowedHashValue;
    ProofOfWork.verifyResponseNonce({ challengeNonce, responseNonce, requestData, maximumAllowedHashValue });
  }

  public start(): void {
    this.periodicallyRefreshChallengeNonce();
    this.periodicallyRefreshProofOfWorkDifficulty();
  }

  public async recordProofOfWork(proofOfWorkId: string): Promise<void> {
    this.proofOfWorkOfLastMinute.set(proofOfWorkId, Date.now());
  }

  private periodicallyRefreshChallengeNonce (): void {
    try {
      this.refreshChallengeNonce();
    } catch (error) {
      console.error(`Encountered error while refreshing challenge nonce: ${error}`);
    } finally {
      setTimeout(async () => this.periodicallyRefreshChallengeNonce(), this.challengeRefreshFrequencyInSeconds * 1000);
    }
  }
  
  private periodicallyRefreshProofOfWorkDifficulty (): void {
    try {
      this.refreshMaximumAllowedHashValue();
    } catch (error) {
      console.error(`Encountered error while updating proof of work difficulty: ${error}`);
    } finally {
      setTimeout(async () => this.periodicallyRefreshProofOfWorkDifficulty(), this.difficultyReevaluationFrequencyInSeconds * 1000);
    }
  }

  public removeProofOfWorkOlderThanOneMinute (): void {
    const oneMinuteAgo = Date.now() - 60 * 1000;
    for (const proofOfWorkId of this.proofOfWorkOfLastMinute.keys()) {
      if (this.proofOfWorkOfLastMinute.get(proofOfWorkId) < oneMinuteAgo) {
        this.proofOfWorkOfLastMinute.delete(proofOfWorkId);
      }
    }
  }

  private refreshChallengeNonce(): void {
    this.challengeNonces.previousChallengeNonce = this.challengeNonces.currentChallengeNonce;
    this.challengeNonces.currentChallengeNonce = ProofOfWork.generateNonce();
  }

  /**
   * Refreshes the difficulty by changing the max hash value.
   * The higher the number, the easier. Scale 1 (hardest) to 2^256 (easiest), represented in HEX.
   * 
   * If solve rate rate is higher than expected, the difficulty will increase rapidly.
   * If solve rate is lower than expected, the difficulty will decrease gradually.
   * The difficulty will never be lower than the initial difficulty.
   */
  private hashValueIncrementPerEvaluation = BigInt(1);
  public async refreshMaximumAllowedHashValue (): Promise<void> {
    // Cleanup proof-of-work cache and update solve rate.
    this.removeProofOfWorkOlderThanOneMinute();

    const latestSolveCountPerMinute = this.proofOfWorkOfLastMinute.size;

    // NOTE: bigint arithmetic does NOT work with decimals, so we work with "full numbers" by multiplying by a scale factor.
    const scaleFactor = 1_000_000;
    const difficultyEvaluationsPerMinute = 60000 / (this.difficultyReevaluationFrequencyInSeconds * 1000); // assumed to be >= 1;

    // NOTE: easier difficulty is represented by a larger max allowed hash value
    //       and harder difficulty is represented by a smaller max allowed hash value.
    const currentSolveRateInFractionOfDesiredSolveRate = latestSolveCountPerMinute / this.desiredSolveCountPerMinute;
    if (latestSolveCountPerMinute > this.desiredSolveCountPerMinute) {
      this.hashValueIncrementPerEvaluation = undefined;

      // if solve rate is higher than desired, make difficulty harder by making the max allowed hash value smaller
      
      // set higher to make difficulty increase faster.
      // This should also be relative to how often the difficulty is reevaluated if the reevaluation frequency is adjustable.
      const increaseMultiplier = 1;

      const newMaximumHashValueAsBigIntPriorToMultiplierAdjustment
        = (this.currentMaximumHashValueAsBigInt * BigInt(scaleFactor)) / 
          (BigInt(Math.floor(currentSolveRateInFractionOfDesiredSolveRate * increaseMultiplier * scaleFactor)));

      // set higher to make difficulty increase faster.
      // This should also be relative to how often the difficulty is reevaluated if the reevaluation frequency is adjustable.
      const hashValueDecreaseAmountPriorToEvaluationFrequencyAdjustment
         = (this.currentMaximumHashValueAsBigInt - newMaximumHashValueAsBigIntPriorToMultiplierAdjustment) *
           (BigInt(Math.floor(increaseMultiplier * scaleFactor)) / BigInt(scaleFactor));
      
      const hashValueDecreaseAmount = hashValueDecreaseAmountPriorToEvaluationFrequencyAdjustment / BigInt(difficultyEvaluationsPerMinute);

      this.currentMaximumHashValueAsBigInt -= hashValueDecreaseAmount;
    } else {
      // if solve rate is lower than desired, make difficulty easier by making the max allowed hash value larger

      if (this.currentMaximumHashValueAsBigInt === this.initialMaximumHashValueAsBigInt) {
        // if current difficulty is already at initial difficulty, nothing to do
        return;
      }

      if (this.hashValueIncrementPerEvaluation === undefined) {
        const backToInitialDifficultyInMinutes = 10;
        const differenceBetweenInitialAndCurrentDifficulty = this.initialMaximumHashValueAsBigInt - this.currentMaximumHashValueAsBigInt;
        this.hashValueIncrementPerEvaluation
          = differenceBetweenInitialAndCurrentDifficulty / BigInt(backToInitialDifficultyInMinutes * difficultyEvaluationsPerMinute);
      }

      // if newly calculated difficulty is lower than initial difficulty, just use the initial difficulty
      const newMaximumAllowedHashValueAsBigInt = this.currentMaximumHashValueAsBigInt + this.hashValueIncrementPerEvaluation;
      if (newMaximumAllowedHashValueAsBigInt >= this.initialMaximumHashValueAsBigInt) {
        this.currentMaximumHashValueAsBigInt = this.initialMaximumHashValueAsBigInt;
      } else {
        this.currentMaximumHashValueAsBigInt = newMaximumAllowedHashValueAsBigInt;
      }
    }
  }
}
