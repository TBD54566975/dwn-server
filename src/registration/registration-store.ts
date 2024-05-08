import { Kysely } from 'kysely';
import type { RegistrationData } from './registration-types.js';
import type { Dialect } from '@tbd54566975/dwn-sql-store';

/**
 * The RegistrationStore is responsible for storing and retrieving tenant registration information.
 */
export class RegistrationStore {
  private static readonly registeredTenantTableName = 'registeredTenants';

  private db: Kysely<RegistrationDatabase>;

  private constructor (sqlDialect: Dialect) {
    this.db = new Kysely<RegistrationDatabase>({ dialect: sqlDialect });
  }

  /**
   * Creates a new RegistrationStore instance.
   */
  public static async create(sqlDialect: Dialect): Promise<RegistrationStore> {
    const proofOfWorkManager = new RegistrationStore(sqlDialect);

    await proofOfWorkManager.initialize();

    return proofOfWorkManager;
  }

  private async initialize(): Promise<void> {
    await this.db.schema
    .createTable(RegistrationStore.registeredTenantTableName)
    .ifNotExists()
    .addColumn('did', 'text', (column) => column.primaryKey())
    .addColumn('termsOfServiceHash', 'text')
    .execute();
  }

  /**
   * Inserts or updates the tenant registration information.
   */
  public async insertOrUpdateTenantRegistration(registrationData: RegistrationData): Promise<void> {
    await this.db
      .insertInto(RegistrationStore.registeredTenantTableName)
      .values(registrationData)
      .onConflict((oc) =>
        oc.column('did').doUpdateSet((eb) => ({
          termsOfServiceHash: eb.ref('excluded.termsOfServiceHash'),
        })),
      )
      // Executes the query. No error is thrown if the query doesn’t affect any rows (ie. if the insert or update didn’t change anything).
      .executeTakeFirst();
  }

  /**
   * Retrieves the tenant registration information.
   */
  public async getTenantRegistration(tenantDid: string): Promise<RegistrationData | undefined> {
    const result = await this.db
      .selectFrom(RegistrationStore.registeredTenantTableName)
      .select('did')
      .select('termsOfServiceHash')
      .where('did', '=', tenantDid)
      .execute();

    if (result.length === 0) {
      return undefined;
    }

    return result[0];
  }
}

interface RegisteredTenants {
  did: string;
  termsOfServiceHash: string;
}

interface RegistrationDatabase {
  registeredTenants: RegisteredTenants;
}
