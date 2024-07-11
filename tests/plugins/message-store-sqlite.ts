import type { MessageStore } from "@tbd54566975/dwn-sdk-js";
import { MessageStoreSql } from "@tbd54566975/dwn-sql-store";
import { getDialectFromUrl } from "../../src/storage.js";

/**
 * An example of a plugin. Used for testing.
 * The points to note are:
 * - The class must be a default export.
 * - The constructor must not take any arguments.
 */
export default class MessageStoreSqlite extends MessageStoreSql implements MessageStore {
  constructor() {
    const sqliteDialect = getDialectFromUrl(new URL('sqlite://'));
    super(sqliteDialect);

    // NOTE: the following line is added purely to test the constructor invocation.
    MessageStoreSqlite.spyingTheConstructor();
  }

  /**
   * NOTE: This method is introduced purely to indirectly test/spy invocation of the constructor.
   * As I was unable to find an easy way to directly spy the constructor.
   */
  public static spyingTheConstructor(): void {
  }
}