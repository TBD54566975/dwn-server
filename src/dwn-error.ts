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
}

/**
 * DWN Server error codes.
 */
export enum DwnServerErrorCode {
  ProofOfWorkInsufficientLeadingZeros = 'ProofOfWorkInsufficientLeadingZeros',
  ProofOfWorkInvalidOrExpiredChallenge = 'ProofOfWorkInvalidOrExpiredChallenge',
  TenantRegistrationOutdatedTermsOfService = 'TenantRegistrationOutdatedTermsOfService',
}
