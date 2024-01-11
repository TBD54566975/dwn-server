import { DwnServerError, DwnServerErrorCode } from "../dwn-error.js";
import type { ProofOfWorkChallengeModel } from "./proof-of-work-types.js";
import { ProofOfWork } from "./proof-of-work.js";

/**
 * Manages proof-of-work challenge difficulty and lifecycle based on solve rate.
 * Can have multiple instances each having their own desired solve rate and difficulty.
 */
export class ProofOfWorkManager {
  // Takes from seconds to ~1 minute to solve on an M1 MacBook.
  private static readonly defaultMaximumAllowedHashValue = '000000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF';

  // Challenge nonces that can be used for proof-of-work.
  private challengeNonces: { currentChallengeNonce: string, previousChallengeNonce?: string };

  // There is opportunity to improve implementation here.
  private proofOfWorkOfLastMinute: Map<string, number> = new Map(); // proofOfWorkId -> timestamp of proof-of-work

  private difficultyIncreaseMultiplier: number;
  private currentMaximumAllowedHashValueAsBigInt: bigint;
  private initialMaximumAllowedHashValueAsBigInt: bigint;
  private desiredSolveCountPerMinute: number;

  /**
   * How often the challenge nonce is refreshed.
   */
  public challengeRefreshFrequencyInSeconds: number;

  /**
   * How often the difficulty is reevaluated.
   */
  public difficultyReevaluationFrequencyInSeconds: number;

  /**
   * The current maximum allowed hash value.
   */
  public get currentMaximumAllowedHashValue(): bigint {
    return this.currentMaximumAllowedHashValueAsBigInt;
  }

  /**
   * The current proof-of-work solve rate.
   */
  public get currentSolveCountPerMinute(): number {
    return this.proofOfWorkOfLastMinute.size;
  }

  private constructor (input: {
    desiredSolveCountPerMinute: number,
    initialMaximumAllowedHashValue: string,
    difficultyIncreaseMultiplier: number,
    challengeRefreshFrequencyInSeconds: number,
    difficultyReevaluationFrequencyInSeconds: number
  }) {
    const { desiredSolveCountPerMinute, initialMaximumAllowedHashValue } = input;

    this.challengeNonces = { currentChallengeNonce: ProofOfWork.generateNonce() };
    this.currentMaximumAllowedHashValueAsBigInt = BigInt(`0x${initialMaximumAllowedHashValue}`);
    this.initialMaximumAllowedHashValueAsBigInt = BigInt(`0x${initialMaximumAllowedHashValue}`);
    this.desiredSolveCountPerMinute = desiredSolveCountPerMinute;
    this.difficultyIncreaseMultiplier = input.difficultyIncreaseMultiplier;
    this.challengeRefreshFrequencyInSeconds = input.challengeRefreshFrequencyInSeconds;
    this.difficultyReevaluationFrequencyInSeconds = input.difficultyReevaluationFrequencyInSeconds;
  }

  /**
   * Creates a new ProofOfWorkManager instance.
   * @param input.difficultyIncreaseMultiplier How fast to increase difficulty when solve rate is higher than desired. Must be >= 1.
   *   Defaults to 1 which means if the solve rate is 2x the desired solve rate, the difficulty will increase by 2x.
   *   If set to 2, it means if the solve rate is 2x the desired solve rate, the difficulty will increase by 4x.
   * @param input.challengeRefreshFrequencyInSeconds How often the challenge nonce is refreshed. Defaults to 10 minutes.
   * @param input.difficultyReevaluationFrequencyInSeconds How often the difficulty is reevaluated. Defaults to 10 seconds.
   */
  public static async create(input: {
    desiredSolveCountPerMinute: number,
    autoStart: boolean,
    initialMaximumAllowedHashValue?: string,
    difficultyIncreaseMultiplier?: number,
    challengeRefreshFrequencyInSeconds?: number,
    difficultyReevaluationFrequencyInSeconds?: number
  }): Promise<ProofOfWorkManager> {
    const { desiredSolveCountPerMinute } = input;

    const initialMaximumAllowedHashValue = input.initialMaximumAllowedHashValue ?? ProofOfWorkManager.defaultMaximumAllowedHashValue;
    const difficultyIncreaseMultiplier = input.difficultyIncreaseMultiplier ?? 1; // 1x default
    const challengeRefreshFrequencyInSeconds = input.challengeRefreshFrequencyInSeconds ?? 10 * 60; // 10 minutes default
    const difficultyReevaluationFrequencyInSeconds = input.difficultyReevaluationFrequencyInSeconds ?? 10; // 10 seconds default

    const proofOfWorkManager = new ProofOfWorkManager({
      desiredSolveCountPerMinute,
      initialMaximumAllowedHashValue,
      difficultyIncreaseMultiplier,
      challengeRefreshFrequencyInSeconds,
      difficultyReevaluationFrequencyInSeconds
    });

    if (input.autoStart) {
      proofOfWorkManager.start();
    }

    return proofOfWorkManager;
  }

  /**
   * Starts the proof-of-work manager by starting the challenge nonce and difficulty refresh timers.
   */
  public start(): void {
    this.periodicallyRefreshChallengeNonce();
    this.periodicallyRefreshProofOfWorkDifficulty();
  }

  public getProofOfWorkChallenge(): ProofOfWorkChallengeModel {
    return {
      challengeNonce: this.challengeNonces.currentChallengeNonce,
      maximumAllowedHashValue: ProofOfWorkManager.bigIntToHexString(this.currentMaximumAllowedHashValue),
    };
  }

  /**
   * Verifies the proof-of-work meets the difficulty requirement.
   */
  public async verifyProofOfWork(proofOfWork: {
    challengeNonce: string;
    responseNonce: string;
    requestData: string;
  }): Promise<void> {
    const { challengeNonce, responseNonce, requestData } = proofOfWork;

    if (this.proofOfWorkOfLastMinute.has(responseNonce)) {
      throw new DwnServerError(
        DwnServerErrorCode.ProofOfWorkManagerResponseNonceReused,
        `Not allowed to reused response nonce: ${responseNonce}.`
      );
    }

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

    this.recordProofOfWork(responseNonce);
  }

  /**
   * Records a successful proof-of-work.
   * Exposed for testing purposes.
   */
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

  private removeProofOfWorkOlderThanOneMinute (): void {
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
  private async refreshMaximumAllowedHashValue (): Promise<void> {
    // Cleanup proof-of-work cache and update solve rate.
    this.removeProofOfWorkOlderThanOneMinute();

    const latestSolveCountPerMinute = this.proofOfWorkOfLastMinute.size;

    // NOTE: bigint arithmetic does NOT work with decimals, so we work with "full numbers" by multiplying by a scale factor.
    const scaleFactor = 1_000_000;
    const difficultyEvaluationsPerMinute = 60000 / (this.difficultyReevaluationFrequencyInSeconds * 1000); // assumed to be >= 1;

    // NOTE: easier difficulty is represented by a larger max allowed hash value
    //       and harder difficulty is represented by a smaller max allowed hash value.
    if (latestSolveCountPerMinute > this.desiredSolveCountPerMinute) {
      // if solve rate is higher than desired, make difficulty harder by making the max allowed hash value smaller
      
      const currentSolveRateInFractionOfDesiredSolveRate = latestSolveCountPerMinute / this.desiredSolveCountPerMinute;
      const newMaximumAllowedHashValueAsBigIntPriorToMultiplierAdjustment
        = (this.currentMaximumAllowedHashValueAsBigInt * BigInt(scaleFactor)) / 
          (BigInt(Math.floor(currentSolveRateInFractionOfDesiredSolveRate * this.difficultyIncreaseMultiplier * scaleFactor)));

      const hashValueDecreaseAmountPriorToEvaluationFrequencyAdjustment
        = (this.currentMaximumAllowedHashValueAsBigInt - newMaximumAllowedHashValueAsBigIntPriorToMultiplierAdjustment) *
          (BigInt(Math.floor(this.difficultyIncreaseMultiplier * scaleFactor)) / BigInt(scaleFactor));
          
      // Adjustment based on the reevaluation frequency to provide more-or-less consistent behavior regardless of the reevaluation frequency.
      const hashValueDecreaseAmount = hashValueDecreaseAmountPriorToEvaluationFrequencyAdjustment / BigInt(difficultyEvaluationsPerMinute);

      this.currentMaximumAllowedHashValueAsBigInt -= hashValueDecreaseAmount;

      // Resetting to allow hash increment to be recalculated when difficulty needs to be reduced (in `else` block below)
      this.hashValueIncrementPerEvaluation = undefined;
    } else {
      // if solve rate is lower than desired, make difficulty easier by making the max allowed hash value larger

      if (this.currentMaximumAllowedHashValueAsBigInt === this.initialMaximumAllowedHashValueAsBigInt) {
        // if current difficulty is already at initial difficulty, nothing to do
        return;
      }

      if (this.hashValueIncrementPerEvaluation === undefined) {
        const backToInitialDifficultyInMinutes = 10;
        const differenceBetweenInitialAndCurrentDifficulty
          = this.initialMaximumAllowedHashValueAsBigInt - this.currentMaximumAllowedHashValueAsBigInt;
        this.hashValueIncrementPerEvaluation
          = differenceBetweenInitialAndCurrentDifficulty / BigInt(backToInitialDifficultyInMinutes * difficultyEvaluationsPerMinute);
      }

      // if newly calculated difficulty is lower than initial difficulty, just use the initial difficulty
      const newMaximumAllowedHashValueAsBigInt = this.currentMaximumAllowedHashValueAsBigInt + this.hashValueIncrementPerEvaluation;
      if (newMaximumAllowedHashValueAsBigInt >= this.initialMaximumAllowedHashValueAsBigInt) {
        this.currentMaximumAllowedHashValueAsBigInt = this.initialMaximumAllowedHashValueAsBigInt;
      } else {
        this.currentMaximumAllowedHashValueAsBigInt = newMaximumAllowedHashValueAsBigInt;
      }
    }
  }

  /**
   * Only used by refreshMaximumAllowedHashValue() to reduce the challenge difficulty gradually.
   */
  private hashValueIncrementPerEvaluation = BigInt(1);

  /**
   * Verifies that the supplied string is a HEX string.
   */
  public static isHexString(str: string): boolean {
    const regexp = /^[0-9a-fA-F]+$/;
    return regexp.test(str);
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
}
