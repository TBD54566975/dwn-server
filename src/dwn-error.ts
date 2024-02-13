/**
 * A class that represents a DWN Server error.
 */
export class DwnServerError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);

    this.name = 'DwnServerError';
  }

  /**
   * Called by `JSON.stringify(...)` automatically.
   */
  public toJSON(): { code: string, message: string } {
    return {
      code: this.code,
      message: this.message,
    };
  }
}

/**
 * DWN Server error codes.
 */
export enum DwnServerErrorCode {
  ConnectionSubscriptionJsonRPCIdExists = 'ConnectionSubscriptionJsonRPCIdExists',
  ConnectionSubscriptionJsonRPCIdNotFound = 'ConnectionSubscriptionJsonRPCIdNotFound',
  ProofOfWorkInsufficientSolutionNonce = 'ProofOfWorkInsufficientSolutionNonce',
  ProofOfWorkInvalidOrExpiredChallenge = 'ProofOfWorkInvalidOrExpiredChallenge',
  ProofOfWorkManagerInvalidChallengeNonce = 'ProofOfWorkManagerInvalidChallengeNonce',
  ProofOfWorkManagerInvalidResponseNonceFormat = 'ProofOfWorkManagerInvalidResponseNonceFormat',
  ProofOfWorkManagerResponseNonceReused = 'ProofOfWorkManagerResponseNonceReused',
  RegistrationManagerInvalidOrOutdatedTermsOfServiceHash = 'RegistrationManagerInvalidOrOutdatedTermsOfServiceHash',
  TenantRegistrationOutdatedTermsOfService = 'TenantRegistrationOutdatedTermsOfService',
}
