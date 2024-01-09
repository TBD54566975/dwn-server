import type { TenantGate } from '@tbd54566975/dwn-sdk-js';
import type { RegistrationStore } from './registration-store.js';

export class RegistrationTenantGate implements TenantGate {
  private constructor(private registrationStore: RegistrationStore, private termsOfServiceHash: string) { }

  public static async create(registrationStore: RegistrationStore, termsOfServiceHash: string): Promise<RegistrationTenantGate> {
    const tenantGate = new RegistrationTenantGate(registrationStore, termsOfServiceHash);
    return tenantGate;
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
