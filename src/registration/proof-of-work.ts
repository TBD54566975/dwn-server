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
    requiredLeadingZerosInResultingHash: number;
    challenge: string;
    responseNonce: string;
    requestData: string;
  }): void {
    const computedHash = this.computeHash(input);

    const hasSufficientLeadingZeros = computedHash.startsWith(
      '0'.repeat(input.requiredLeadingZerosInResultingHash),
    );

    if (!hasSufficientLeadingZeros) {
      throw new DwnServerError(
        DwnServerErrorCode.ProofOfWorkInsufficientLeadingZeros,
        `Insufficient leading zeros for computed hash ${computedHash}, needs ${input.requiredLeadingZerosInResultingHash} zeros.`,
      );
    }
  }

  public static findQualifiedNonce(input: {
    requiredLeadingZerosInResultingHash: number;
    challenge: string;
    requestData?: string;
  }): string {
    const startTime = Date.now();

    const { requiredLeadingZerosInResultingHash, challenge, requestData } =
      input;

    const requiredHashPrefix = '0'.repeat(requiredLeadingZerosInResultingHash);

    let iterations = 1;
    let randomNonce;
    let hasSufficientLeadingZeros = false;
    do {
      randomNonce = this.generateNonce();
      const computedHash = this.computeHash({
        challenge,
        responseNonce: randomNonce,
        requestData,
      });

      hasSufficientLeadingZeros = computedHash.startsWith(requiredHashPrefix);

      iterations++;

      // Log every 1M iterations.
      if (iterations % 1_000_000 === 0) {
        console.log(
          `iterations: ${iterations}, time lapsed: ${
            Date.now() - startTime
          } ms`,
        );
      }
    } while (!hasSufficientLeadingZeros);

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
