import { ProofOfWork } from "./proof-of-work.js";

export class ProofOfWorkManager {
  private proofOfWorkOfLastMinute: Map<string, number> = new Map(); // proofOfWorkId -> timestamp of proof-of-work
  private currentMaximumHashValueAsBigInt: bigint;
  private initialMaximumHashValueAsBigInt: bigint;
  private desiredSolveCountPerMinute: number;

  static readonly #difficultyReevaluationFrequencyInMilliseconds = 10000;

  public get currentMaximumAllowedHashValue(): bigint {
    return this.currentMaximumHashValueAsBigInt;
  }

  public get currentSolveCountPerMinute(): number {
    return this.proofOfWorkOfLastMinute.size;
  }

  private constructor (desiredSolveCountPerMinute: number, initialMaximumHashValue: string) {
    this.currentMaximumHashValueAsBigInt = BigInt(`0x${initialMaximumHashValue}`);
    this.initialMaximumHashValueAsBigInt = BigInt(`0x${initialMaximumHashValue}`);
    this.desiredSolveCountPerMinute = desiredSolveCountPerMinute;
  }

  public static async create(
    desiredSolveCountPerMinute: number,
    initialMaximumHashValue: string,
    autoStart: boolean = false
  ): Promise<ProofOfWorkManager> {
    const proofOfWorkManager = new ProofOfWorkManager(desiredSolveCountPerMinute, initialMaximumHashValue);

    if (autoStart) {
      proofOfWorkManager.start();
    }

    return proofOfWorkManager;
  }

  public async verifyProofOfWork(proofOfWork: {
    challenge: string;
    responseNonce: string;
    requestData: string;
  }): Promise<void> {
    // REMINDER: verify challenge is not expired

    ProofOfWork.verifyChallengeResponse({
      challenge: proofOfWork.challenge,
      responseNonce: proofOfWork.responseNonce,
      requestData: proofOfWork.requestData,
      maximumAllowedHashValue: this.currentMaximumAllowedHashValue,
    });
  }

  public start(): void {
    this.periodicallyRefreshProofOfWorkDifficulty();
  }

  public async recordProofOfWork(proofOfWorkId: string): Promise<void> {
    this.proofOfWorkOfLastMinute.set(proofOfWorkId, Date.now());
  }

  private periodicallyRefreshProofOfWorkDifficulty (): void {
    try {
      this.refreshMaximumAllowedHashValue();
    } catch (error) {
      console.error(`Encountered error while updating proof of work difficulty: ${error}`);
    } finally {
      setTimeout(async () => this.periodicallyRefreshProofOfWorkDifficulty(), ProofOfWorkManager.#difficultyReevaluationFrequencyInMilliseconds);
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
    const difficultyEvaluationsPerMinute = 60000 / ProofOfWorkManager.#difficultyReevaluationFrequencyInMilliseconds; // assumed to be >= 1;

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
      
      const hashValueDecreaseAmount
        = hashValueDecreaseAmountPriorToEvaluationFrequencyAdjustment / BigInt(difficultyEvaluationsPerMinute);

      let newMaximumHashValueAsBigInt = this.currentMaximumHashValueAsBigInt - hashValueDecreaseAmount;

      if (newMaximumHashValueAsBigInt === BigInt(0)) {
        // if newMaximumHashValueAsBigInt is 0, we use 1 instead because 0 cannot multiply another number
        newMaximumHashValueAsBigInt = BigInt(1);
      }

      this.currentMaximumHashValueAsBigInt = newMaximumHashValueAsBigInt;
    } else {
      // if solve rate is lower than desired, make difficulty easier by making the max allowed hash value larger

      if (this.currentMaximumHashValueAsBigInt === this.initialMaximumHashValueAsBigInt) {
        // if current difficulty is already at initial difficulty, don't make it any easier
        return;
      }

      if (this.hashValueIncrementPerEvaluation === undefined) {
        const backToInitialDifficultyInMinutes = 10;
        const differenceBetweenInitialAndCurrentDifficulty = this.initialMaximumHashValueAsBigInt - this.currentMaximumHashValueAsBigInt;
        this.hashValueIncrementPerEvaluation
          = differenceBetweenInitialAndCurrentDifficulty / BigInt(backToInitialDifficultyInMinutes * difficultyEvaluationsPerMinute);
      }

      this.currentMaximumHashValueAsBigInt += this.hashValueIncrementPerEvaluation;
    }
  }
}
