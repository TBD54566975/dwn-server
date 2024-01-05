import { ProofOfWorkManager } from "./proof-of-work-manager.js";

type RegistrationRequest = {
  proofOfWork: {
    challenge: string;
    responseNonce: string;
  },
  registrationData: {
    did: string;
    termsOfServiceHash: string;
  }
}

export class RegistrationManager {
  private proofOfWorkManager: ProofOfWorkManager;

  private constructor () {
  }

  public static async create(
  ): Promise<RegistrationManager> {
    const proofOfWorkManager = new RegistrationManager();
    proofOfWorkManager.proofOfWorkManager = await ProofOfWorkManager.create(10, '0FFFFFFFFFFFFFFF');

    return proofOfWorkManager;
  }

  public async handleRegistrationRequest(registrationRequest: RegistrationRequest): Promise<void> {
    this.proofOfWorkManager.verifyProofOfWork({
      challenge: registrationRequest.proofOfWork.challenge,
      responseNonce: registrationRequest.proofOfWork.responseNonce,
      requestData: JSON.stringify(registrationRequest.registrationData),
    });

    // Ensure the supplied terms of service hash matches the one we require.
    if (registrationRequest.registrationData.termsOfServiceHash !== '') {
      throw new Error('Invalid terms of service hash.');
    }

    // Store tenant registration data in database.
    // await this.tenantRegistrationStore.storeTenantRegistration(registrationRequest.registrationData);
  }
}
