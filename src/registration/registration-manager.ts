import { ProofOfWorkManager } from "./proof-of-work-manager.js";
import { ProofOfWork } from "./proof-of-work.js";
import { RegistrationStore } from "./registration-store.js";
import type { RegistrationData, RegistrationRequest } from "./registration-types.js";
import type { ProofOfWorkChallengeModel } from "./proof-of-work-types.js";
import { DwnServerError, DwnServerErrorCode } from "../dwn-error.js";
import type { TenantGate } from "@tbd54566975/dwn-sdk-js";
import { getDialectFromURI } from "../storage.js";
import { readFileSync } from "fs";

/**
 * The RegistrationManager is responsible for managing the registration of tenants.
 * It handles tenant registration requests and provides the corresponding `TenantGate` implementation.
 */
export class RegistrationManager implements TenantGate {
  private proofOfWorkManager: ProofOfWorkManager;
  private registrationStore: RegistrationStore;

  private termsOfServiceHash?: string;
  private termsOfService?: string;

  /**
   * The terms-of-service.
   */
  public getTermsOfService(): string | undefined {
    return this.termsOfService;
  }

  /**
   * The terms-of-service hash. 
   */
  public getTermsOfServiceHash(): string | undefined {
    return this.termsOfServiceHash;
  }

  /**
   * Updates the terms-of-service. Exposed for testing purposes.
   */
  public updateTermsOfService(termsOfService: string): void {
    this.termsOfServiceHash = ProofOfWork.hashAsHexString([termsOfService]);
    this.termsOfService = termsOfService;
  }

  private constructor (termsOfServiceFilePath?: string) {
    if (termsOfServiceFilePath !== undefined) {
      const termsOfService = readFileSync(termsOfServiceFilePath).toString();
      this.updateTermsOfService(termsOfService);
    }
  }

  /**
   * Creates a new RegistrationManager instance.
   */
  public static async create(input: {
    registrationStoreUrl: string,
    termsOfServiceFilePath?: string
  }): Promise<RegistrationManager> {
    const { termsOfServiceFilePath, registrationStoreUrl } = input;

    const registrationManager = new RegistrationManager(termsOfServiceFilePath);

    // Initialize and start ProofOfWorkManager.
    registrationManager.proofOfWorkManager = await ProofOfWorkManager.create({
      autoStart: true,
      desiredSolveCountPerMinute: 10,
      initialMaximumHashValue: '00FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'
    });

    // Initialize RegistrationStore.
    const sqlDialect = getDialectFromURI(new URL(registrationStoreUrl));
    const registrationStore = await RegistrationStore.create(sqlDialect);
    registrationManager.registrationStore = registrationStore;
    
    return registrationManager;
  }

  /**
   * Gets the proof-of-work challenge.
   */
  public getProofOfWorkChallenge(): ProofOfWorkChallengeModel {
    const proofOfWorkChallenge = this.proofOfWorkManager.getProofOfWorkChallenge();
    return proofOfWorkChallenge;
  }

  /**
   * Handles a registration request.
   */
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

  /**
   * The TenantGate implementation.
   */
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
