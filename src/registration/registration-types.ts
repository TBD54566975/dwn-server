export type RegistrationData = {
  did: string;
  termsOfServiceHash: string;
};

export type RegistrationRequest = {
  proofOfWork: {
    challengeNonce: string;
    responseNonce: string;
  },
  registrationData: RegistrationData
};