import { createHash, randomBytes } from 'crypto';

import { DwnServerError, DwnServerErrorCode } from '../dwn-error.js';

/**
 * Utility methods related to proof-of-work.
 */
export class ProofOfWork {
  /**
   * Computes the resulting hash of the given proof-of-work input.
   */
  public static computeHash(input: {
    challengeNonce: string;
    responseNonce: string;
    requestData: string;
  }): string {
    const hashInput = [input.challengeNonce, input.responseNonce, input.requestData];
    return this.hashAsHexString(hashInput);
  }

  /**
   * Computes the hash of the given array of strings.
   */
  public static hashAsHexString(input: string[]): string {
    const hash = createHash('sha256');
    for (const item of input) {
      hash.update(item);
    }

    return hash.digest('hex');
  }

  /**
   * Verifies that the response nonce meets the proof-of-work difficulty requirement.
   */
  public static verifyResponseNonce(input: {
    maximumAllowedHashValue: bigint;
    challengeNonce: string;
    responseNonce: string;
    requestData: string;
  }): void {
    const computedHash = this.computeHash(input);
    const computedHashAsBigInt = BigInt(`0x${computedHash}`);

    if (computedHashAsBigInt > input.maximumAllowedHashValue) {
      throw new DwnServerError(
        DwnServerErrorCode.ProofOfWorkInsufficientSolutionNonce,
        `Insufficient computed hash ${computedHashAsBigInt}, needs to be <= ${input.maximumAllowedHashValue}.`,
      );
    }
  }

  /**
   * Finds a response nonce that qualifies the difficulty requirement for the given proof-of-work challenge and request data.
   */
  public static findQualifiedResponseNonce(input: {
    maximumAllowedHashValue: string;
    challengeNonce: string;
    requestData: string;
  }): string {
    const startTime = Date.now();

    const { maximumAllowedHashValue, challengeNonce, requestData } = input;
    const maximumAllowedHashValueAsBigInt = BigInt(`0x${maximumAllowedHashValue}`);

    let iterations = 1;
    let randomNonce;
    let qualifiedSolutionNonceFound = false;
    do {
      randomNonce = this.generateNonce();
      const computedHash = this.computeHash({
        challengeNonce,
        responseNonce: randomNonce,
        requestData,
      });
      const computedHashAsBigInt = BigInt(`0x${computedHash}`);

      qualifiedSolutionNonceFound = computedHashAsBigInt <= maximumAllowedHashValueAsBigInt;

      iterations++;
    } while (!qualifiedSolutionNonceFound);

    // Log final/successful iteration.
    console.log(
      `iterations: ${iterations}, time lapsed: ${Date.now() - startTime} ms`,
    );

    return randomNonce;
  }

  /**
   * Generates 32 random bytes expressed as a HEX string.
   */
  public static generateNonce(): string {
    const hexString = randomBytes(32).toString('hex').toUpperCase();
    return hexString;
  }
}
