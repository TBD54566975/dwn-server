/**
 * Proof-of-work challenge model returned by the /registration/proof-of-work API.
 */
export type ProofOfWorkChallengeModel = {
  challengeNonce: string;
  maximumAllowedHashValue: string;
};