import type { ActiveTenantCheckResult, TenantGate } from "@tbd54566975/dwn-sdk-js";

export class FormFreeGate implements TenantGate {
  private did: string = 'did:dht:hcf5e55bbm44s4oixp5z89wtxenxyk35su7f5pd4r5np93ikyowy';
  /**
   * The TenantGate implementation.
   */
  public async isActiveTenant(tenant: string): Promise<ActiveTenantCheckResult> {
   return tenant === this.did
        ? { isActiveTenant: true }
        : { isActiveTenant: false, detail: "Tenant is not formfree" };
  }
}