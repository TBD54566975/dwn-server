/**
 * Registration data model to be included as a parameter in the /registration POST request.
 */
export type RegistrationData = {
  did: string;
  termsOfServiceHash: string;
};

/**
 * Registration request model of the /registration POST API.
 */
export type RegistrationRequest = {
  proofOfWork: {
    challengeNonce: string;
    responseNonce: string;
  },
  registrationData: RegistrationData
};