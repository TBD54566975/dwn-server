import type { Dialect } from "@tbd54566975/dwn-sql-store";
import { ProofOfWorkManager } from "./proof-of-work-manager.js";
import { ProofOfWork } from "./proof-of-work.js";
import { RegistrationStore } from "./registration-store.js";
import type { RegistrationRequest } from "./registration-types.js";
import type { ProofOfWorkChallengeModel } from "./proof-of-work-types.js";
import { DwnServerError, DwnServerErrorCode } from "../dwn-error.js";

export class RegistrationManager {
  private proofOfWorkManager: ProofOfWorkManager;
  private registrationStore: RegistrationStore;

  private termsOfServiceHash?: string;
  private termsOfService?: string;

  public getTermsOfService(): string {
    return this.termsOfService;
  }

  private constructor (termsOfService?: string) {
    if (termsOfService) {
      this.termsOfServiceHash = ProofOfWork.hashAsHexString([termsOfService]);
      this.termsOfService = termsOfService;
    }
  }

  public static async create(input: {
    sqlDialect: Dialect,
    termsOfService?: string
  }): Promise<RegistrationManager> {
    const { termsOfService, sqlDialect } = input;

    // Initialize and start ProofOfWorkManager.
    const proofOfWorkManager = new RegistrationManager(termsOfService);
    proofOfWorkManager.proofOfWorkManager = await ProofOfWorkManager.create({
      autoStart: true,
      desiredSolveCountPerMinute: 10,
      initialMaximumHashValue: '00FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'
    });

    // Initialize RegistrationStore.
    proofOfWorkManager.registrationStore = await RegistrationStore.create(sqlDialect);

    return proofOfWorkManager;
  }

  public getProofOfWorkChallenge(): ProofOfWorkChallengeModel {
    const proofOfWorkChallenge = this.proofOfWorkManager.getProofOfWorkChallenge();
    return proofOfWorkChallenge;
  }


  public async handleRegistrationRequest(registrationRequest: RegistrationRequest): Promise<void> {
    // Ensure the supplied terms of service hash matches the one we require.
    if (registrationRequest.registrationData.termsOfServiceHash !== this.termsOfServiceHash) {
      throw new DwnServerError(DwnServerErrorCode.RegistrationManagerInvalidOrOutdatedTermsOfServiceHash,
        `Expecting terms-of-service hash ${this.termsOfServiceHash}, but got ${registrationRequest.registrationData.termsOfServiceHash}.`
      );
    }

    const { challengeNonce, responseNonce } = registrationRequest.proofOfWork;

    await this.proofOfWorkManager.verifyProofOfWork({
      challengeNonce,
      responseNonce,
      requestData: JSON.stringify(registrationRequest.registrationData),
    });

    // Store tenant registration data in database.
    await this.registrationStore.insertOrUpdateTenantRegistration(registrationRequest.registrationData);
  }
}
