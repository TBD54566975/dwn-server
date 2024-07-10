import type { DidResolver } from '@web5/dids';
import type {
  DataStore,
  DwnConfig,
  EventLog,
  EventStream,
  MessageStore,
  ResumableTaskStore,
  TenantGate,
} from '@tbd54566975/dwn-sdk-js';
import type { Dialect } from '@tbd54566975/dwn-sql-store';
import type { DwnServerConfig } from './config.js';

import * as fs from 'fs';
import Cursor from 'pg-cursor';
import Database from 'better-sqlite3';
import pg from 'pg';
import { createPool as MySQLCreatePool } from 'mysql2';
import { PluginLoader } from './plugin-loader.js';

import {
  DataStoreLevel,
  EventLogLevel,
  MessageStoreLevel,
  ResumableTaskStoreLevel,
} from '@tbd54566975/dwn-sdk-js';
import {
  DataStoreSql,
  EventLogSql,
  MessageStoreSql,
  MysqlDialect,
  PostgresDialect,
  ResumableTaskStoreSql,
  SqliteDialect,
} from '@tbd54566975/dwn-sql-store';

export enum StoreType {
  DataStore,
  MessageStore,
  EventLog,
  ResumableTaskStore,
}

export enum BackendTypes {
  LEVEL = 'level',
  SQLITE = 'sqlite',
  MYSQL = 'mysql',
  POSTGRES = 'postgres',
}

export type DwnStore = DataStore | EventLog | MessageStore | ResumableTaskStore;

export async function getDwnConfig(
  config  : DwnServerConfig,
  options : {
    didResolver? : DidResolver,
    tenantGate?  : TenantGate,
    eventStream? : EventStream,
  }
): Promise<DwnConfig> {
  const { tenantGate, eventStream, didResolver } = options;
  const dataStore: DataStore = await getStore(config.dataStore, StoreType.DataStore);
  const eventLog: EventLog = await getStore(config.eventLog, StoreType.EventLog);
  const messageStore: MessageStore = await getStore(config.messageStore, StoreType.MessageStore);
  const resumableTaskStore: ResumableTaskStore = await getStore(config.messageStore, StoreType.ResumableTaskStore);

  return { didResolver, eventStream, eventLog, dataStore, messageStore, resumableTaskStore, tenantGate };
}

function getLevelStore(
  storeURI: URL,
  storeType: StoreType,
): DwnStore {
  switch (storeType) {
    case StoreType.DataStore:
      return new DataStoreLevel({
        blockstoreLocation: storeURI.host + storeURI.pathname + '/DATASTORE',
      });
    case StoreType.MessageStore:
      return new MessageStoreLevel({
        blockstoreLocation: storeURI.host + storeURI.pathname + '/MESSAGESTORE',
        indexLocation: storeURI.host + storeURI.pathname + '/INDEX',
      });
    case StoreType.EventLog:
      return new EventLogLevel({
        location: storeURI.host + storeURI.pathname + '/EVENTLOG',
      });
    case StoreType.ResumableTaskStore:
      return new ResumableTaskStoreLevel({
        location: storeURI.host + storeURI.pathname + '/RESUMABLE-TASK-STORE',
      });
    default:
      throw new Error('Unexpected level store type');
  }
}

function getSqlStore(
  connectionUrl: URL,
  storeType: StoreType,
): DwnStore {
  const dialect = getDialectFromUrl(connectionUrl);

  switch (storeType) {
    case StoreType.DataStore:
      return new DataStoreSql(dialect);
    case StoreType.MessageStore:
      return new MessageStoreSql(dialect);
    case StoreType.EventLog:
      return new EventLogSql(dialect);
    case StoreType.ResumableTaskStore:
      return new ResumableTaskStoreSql(dialect);
    default:
      throw new Error(`Unsupported store type ${storeType} for SQL store.`);
  }
}

/**
 * Check if the given string is a file path.
 */
function isFilePath(configString: string): boolean {
  const filePathPrefixes = ['/', './', '../'];
  return filePathPrefixes.some(prefix => configString.startsWith(prefix));
}

async function getStore(storeString: string, storeType: StoreType.DataStore): Promise<DataStore>;
async function getStore(storeString: string, storeType: StoreType.EventLog): Promise<EventLog>;
async function getStore(storeString: string, storeType: StoreType.MessageStore): Promise<MessageStore>;
async function getStore(storeString: string, storeType: StoreType.ResumableTaskStore): Promise<ResumableTaskStore>;
async function getStore(storeConfigString: string, storeType: StoreType): Promise<DwnStore> {
  if (isFilePath(storeConfigString)) {
    return await loadStoreFromFilePath(storeConfigString, storeType);
  }
  // else treat the `storeConfigString` as a connection string
  
  const storeURI = new URL(storeConfigString);

  switch (storeURI.protocol.slice(0, -1)) {
    case BackendTypes.LEVEL:
      return getLevelStore(storeURI, storeType);

    case BackendTypes.SQLITE:
    case BackendTypes.MYSQL:
    case BackendTypes.POSTGRES:
      return getSqlStore(storeURI, storeType);

    default:
      throw invalidStorageSchemeMessage(storeURI.protocol);
  }
}

/**
 * Loads a DWN store plugin of the given type from the given file path.
 */
async function loadStoreFromFilePath(
  filePath: string,
  storeType: StoreType,
): Promise<DwnStore> {
  switch (storeType) {
    case StoreType.DataStore:
      return await PluginLoader.loadPlugin<DataStore>(filePath);
    case StoreType.EventLog:
      return await PluginLoader.loadPlugin<EventLog>(filePath);
    case StoreType.MessageStore:
      return await PluginLoader.loadPlugin<MessageStore>(filePath);
    case StoreType.ResumableTaskStore:
      return await PluginLoader.loadPlugin<ResumableTaskStore>(filePath);
    default:
      throw new Error(`Loading store for unsupported store type ${storeType} from path ${filePath}`);
  }
}

export function getDialectFromUrl(connectionUrl: URL): Dialect {
  switch (connectionUrl.protocol.slice(0, -1)) {
    case BackendTypes.SQLITE:
      const path = connectionUrl.host + connectionUrl.pathname;
      console.log('SQL-lite relative path:', path ? path : undefined); // NOTE, using ? for lose equality comparison

      if (connectionUrl.host && !fs.existsSync(connectionUrl.host)) {
        console.log('SQL-lite directory does not exist, creating:', connectionUrl.host);
        fs.mkdirSync(connectionUrl.host, { recursive: true });
      }

      return new SqliteDialect({
        database: async () => new Database(path),
      });
    case BackendTypes.MYSQL:
      return new MysqlDialect({
        pool: async () => MySQLCreatePool(connectionUrl.toString()),
      });
    case BackendTypes.POSTGRES:
      return new PostgresDialect({
        pool: async () => new pg.Pool({ connectionString: connectionUrl.toString() }),
        cursor: Cursor,
      });
  }
}

function invalidStorageSchemeMessage(protocol: string): string {
  const schemes = [];
  for (const [_, value] of Object.entries(BackendTypes)) {
    schemes.push(value);
  }
  return (
    'Unknown storage protocol ' +
    protocol.slice(0, 1) +
    '! Please use one of: ' +
    schemes.join(', ') +
    '. For details, see README'
  );
}
