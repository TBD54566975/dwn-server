import { createHash } from 'crypto';

import { DwnServerError, DwnServerErrorCode } from '../dwn-error.js';

export class ProofOfWork {
  public static computeHash(input: {
    challenge: string;
    responseNonce: string;
    requestData?: string;
  }): string {
    const hash = createHash('sha256');
    hash.update(input.challenge);
    hash.update(input.responseNonce);

    if (input.requestData !== undefined) {
      hash.update(input.requestData);
    }

    return hash.digest('hex');
  }

  public static verifyChallengeResponse(input: {
    maximumAllowedHashValue: bigint;
    challenge: string;
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

  public static findQualifiedNonce(input: {
    maximumAllowedHashValue: string;
    challenge: string;
    requestData?: string;
  }): string {
    const startTime = Date.now();

    const { maximumAllowedHashValue, challenge, requestData } = input;
    const maximumAllowedHashValueAsBigInt = BigInt(`0x${maximumAllowedHashValue}`);

    let iterations = 1;
    let randomNonce;
    let qualifiedSolutionNonceFound = false;
    do {
      randomNonce = this.generateNonce();
      const computedHash = this.computeHash({
        challenge,
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

  public static generateNonce(size: number = 32): string {
    const nonceChars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    let nonce = '';
    while (nonce.length < size) {
      nonce += nonceChars.charAt(Math.floor(Math.random() * nonceChars.length));
    }
    return nonce;
  }
}
