import { createHash, randomBytes } from 'crypto';

import { DwnServerError, DwnServerErrorCode } from '../dwn-error.js';

export class ProofOfWork {
  public static computeHash(input: {
    challengeNonce: string;
    responseNonce: string;
    requestData?: string;
  }): string {
    const hashInput = [input.challengeNonce, input.responseNonce];

    if (input.requestData) {
      hashInput.push(input.requestData);
    }
    
    return this.hashAsHexString(hashInput);
  }

  public static hashAsHexString(input: string[]): string {
    const hash = createHash('sha256');
    for (const item of input) {
      hash.update(item);
    }

    return hash.digest('hex');
  }

  public static verifyResponseNonce(input: {
    maximumAllowedHashValue: bigint;
    challengeNonce: string;
    responseNonce: string;
    requestData?: string;
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

  public static findQualifiedResponseNonce(input: {
    maximumAllowedHashValue: string;
    challengeNonce: string;
    requestData?: string;
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

      // Log every 1M iterations.
      if (iterations % 1_000_000 === 0) {
        console.log(
          `iterations: ${iterations}, time lapsed: ${
            Date.now() - startTime
          } ms`,
        );
      }
    } while (!qualifiedSolutionNonceFound);

    // Log final/successful attempt.
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
