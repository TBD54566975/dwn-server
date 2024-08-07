import type { Dialect } from '@tbd54566975/dwn-sql-store';
import { Kysely } from 'kysely';

/**
 * The SqlTtlCache is responsible for storing and retrieving cache data with TTL (Time-to-Live).
 */
export class SqlTtlCache {
  private static readonly cacheTableName = 'cacheEntries';
  private static readonly cleanupIntervalInSeconds = 60;

  private sqlDialect: Dialect;
  private db: Kysely<CacheDatabase>;
  private cleanupTimer: NodeJS.Timeout;

  private constructor(sqlDialect: Dialect) {
    this.db = new Kysely<CacheDatabase>({ dialect: sqlDialect });
    this.sqlDialect = sqlDialect;
  }

  /**
   * Creates a new SqlTtlCache instance.
   */
  public static async create(sqlDialect: Dialect): Promise<SqlTtlCache> {
    const cacheManager = new SqlTtlCache(sqlDialect);

    await cacheManager.initialize();

    return cacheManager;
  }

  private async initialize(): Promise<void> {

    // create table if it doesn't exist
    const tableExists = await this.sqlDialect.hasTable(this.db, SqlTtlCache.cacheTableName);
    if (!tableExists) {
      await this.db.schema
        .createTable(SqlTtlCache.cacheTableName)
        .ifNotExists() // kept to show supported by all dialects in contrast to ifNotExists() below, though not needed due to tableExists check above
        // 512 chars to accommodate potentially large `state` in Web5 Connect flow
        .addColumn('key', 'varchar(512)', (column) => column.primaryKey())
        .addColumn('value', 'text', (column) => column.notNull())
        .addColumn('expiry', 'integer', (column) => column.notNull())
        .execute();
  
      await this.db.schema
        .createIndex('index_expiry')
        // .ifNotExists() // intentionally kept commented out code to show that it is not supported by all dialects (ie. MySQL)
        .on(SqlTtlCache.cacheTableName)
        .column('expiry')
        .execute();
    }

    // Start the cleanup timer
    this.startCleanupTimer();
  }

  /**
   * Starts a timer to periodically clean up expired cache entries.
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(async () => {
      await this.cleanUpExpiredEntries();
    }, SqlTtlCache.cleanupIntervalInSeconds * 1000);
  }

  /**
   * Inserts a cache entry.
   * @param ttl The time-to-live in seconds.
   */
  public async insert(key: string, value: object, ttl: number): Promise<void> {
    const expiry = Date.now() + (ttl * 1000);

    const objectString = JSON.stringify(value);

    await this.db
      .insertInto(SqlTtlCache.cacheTableName)
      .values({ key, value: objectString, expiry })
      .execute();
  }

  /**
   * Retrieves a cache entry if it is not expired and cleans up expired entries.
   */
  public async get(key: string): Promise<object | undefined> {
    const result = await this.db
      .selectFrom(SqlTtlCache.cacheTableName)
      .select('key')
      .select('value')
      .select('expiry')
      .where('key', '=', key)
      .execute();

    if (result.length === 0) {
      return undefined;
    }

    const entry = result[0];

    // if the entry is expired, don't return it and delete it
    if (Date.now() >= entry.expiry) {
      this.delete(key); // no need to await
      return undefined;
    }

    return JSON.parse(entry.value);
  }

  /**
   * Deletes a cache entry.
   */
  public async delete(key: string): Promise<void> {
    await this.db
      .deleteFrom(SqlTtlCache.cacheTableName)
      .where('key', '=', key)
      .execute();
  }

  /**
   * Cleans up expired cache entries.
   */
  public async cleanUpExpiredEntries(): Promise<void> {
    await this.db
      .deleteFrom(SqlTtlCache.cacheTableName)
      .where('expiry', '<', Date.now())
      .execute();
  }
}

interface CacheEntry {
  key: string;
  value: string;
  expiry: number;
}

interface CacheDatabase {
  cacheEntries: CacheEntry;
}
