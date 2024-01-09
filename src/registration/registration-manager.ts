import type { Dialect } from "@tbd54566975/dwn-sql-store";
import { ProofOfWorkManager } from "./proof-of-work-manager.js";
import { ProofOfWork } from "./proof-of-work.js";
import { RegistrationStore } from "./registration-store.js";
import type { RegistrationData, RegistrationRequest } from "./registration-types.js";
import type { ProofOfWorkChallengeModel } from "./proof-of-work-types.js";
import { DwnServerError, DwnServerErrorCode } from "../dwn-error.js";
import type { TenantGate } from "@tbd54566975/dwn-sdk-js";

export class RegistrationManager implements TenantGate {
  private proofOfWorkManager: ProofOfWorkManager;
  private registrationStore: RegistrationStore;

  private termsOfServiceHash?: string;
  private termsOfService?: string;

  public getTermsOfService(): string {
    return this.termsOfService;
  }

  public getTermsOfServiceHash(): string {
    return this.termsOfServiceHash;
  }

  /**
   * Updates the terms-of-service. Exposed for testing purposes.
   */
  public updateTermsOfService(termsOfService: string): void {
    this.termsOfServiceHash = ProofOfWork.hashAsHexString([termsOfService]);
    this.termsOfService = termsOfService;
  }

  private constructor (termsOfService?: string) {
    if (termsOfService) {
      this.updateTermsOfService(termsOfService);
    }
  }

  public static async create(input: {
    sqlDialect: Dialect,
    termsOfService?: string
  }): Promise<RegistrationManager> {
    const { termsOfService, sqlDialect } = input;

    // Initialize and start ProofOfWorkManager.
    const registrationManager = new RegistrationManager(termsOfService);
    registrationManager.proofOfWorkManager = await ProofOfWorkManager.create({
      autoStart: true,
      desiredSolveCountPerMinute: 10,
      initialMaximumHashValue: '00FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'
    });

    // Initialize RegistrationStore.
    const registrationStore = await RegistrationStore.create(sqlDialect);
    registrationManager.registrationStore = registrationStore;
    
    return registrationManager;
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
    await this.recordTenantRegistration(registrationRequest.registrationData);
  }

  /**
   * Records the given registration data in the database.
   * Exposed as a public method for testing purposes.
   */
  public async recordTenantRegistration(registrationData: RegistrationData): Promise<void> {
    await this.registrationStore.insertOrUpdateTenantRegistration(registrationData);
  }

  public async isActiveTenant(tenant: string): Promise<boolean> {
    const tenantRegistration = await this.registrationStore.getTenantRegistration(tenant);

    if (tenantRegistration === undefined) {
      return false
    }

    if (tenantRegistration.termsOfServiceHash !== this.termsOfServiceHash) {
      return false;
    }

    return true;
  }
}
