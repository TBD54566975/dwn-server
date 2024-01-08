import { Kysely } from 'kysely';
import type { RegistrationData } from './registration-types.js';
import type { Dialect } from '@tbd54566975/dwn-sql-store';

export class RegistrationStore {
  private db: Kysely<RegistrationDatabase>;

  private constructor (sqlDialect: Dialect) {
    this.db = new Kysely<RegistrationDatabase>({ dialect: sqlDialect });
  }

  public static async create(sqlDialect: Dialect): Promise<RegistrationStore> {
    const proofOfWorkManager = new RegistrationStore(sqlDialect);

    await proofOfWorkManager.initialize();

    return proofOfWorkManager;
  }

  private async initialize(): Promise<void> {
    await this.db.schema
    .createTable('authorizedTenants')
    .ifNotExists()
    .addColumn('did', 'text', (column) => column.primaryKey())
    .addColumn('termsOfServiceHash', 'boolean')
    .execute();
  }

  public async insertOrUpdateTenantRegistration(registrationData: RegistrationData): Promise<void> {
    await this.db
      .insertInto('authorizedTenants')
      .values(registrationData)
      .onConflict((oc) =>
        oc.column('did').doUpdateSet((eb) => ({
          termsOfServiceHash: eb.ref('excluded.termsOfServiceHash'),
        })),
      )
      .executeTakeFirst();
  }
}

interface AuthorizedTenants {
  did: string;
  termsOfServiceHash: string;
  proofOfWorkTime: number;
}

interface RegistrationDatabase {
  authorizedTenants: AuthorizedTenants;
}
