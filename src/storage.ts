import * as fs from 'fs';

import {
  DataStoreLevel,
  EventEmitterStream,
  EventLogLevel,
  MessageStoreLevel,
} from '@tbd54566975/dwn-sdk-js';
import type {
  DataStore,
  DwnConfig,
  EventLog,
  MessageStore,
  TenantGate,
} from '@tbd54566975/dwn-sdk-js';
import type { Dialect } from '@tbd54566975/dwn-sql-store';
import {
  DataStoreSql,
  EventLogSql,
  MessageStoreSql,
  MysqlDialect,
  PostgresDialect,
  SqliteDialect,
} from '@tbd54566975/dwn-sql-store';

import Database from 'better-sqlite3';
import { createPool as MySQLCreatePool } from 'mysql2';
import pg from 'pg';
import Cursor from 'pg-cursor';

import type { DwnServerConfig } from './config.js';

export enum EStoreType {
  DataStore,
  MessageStore,
  EventLog,
}

export enum BackendTypes {
  LEVEL = 'level',
  SQLITE = 'sqlite',
  MYSQL = 'mysql',
  POSTGRES = 'postgres',
}

export type StoreType = DataStore | EventLog | MessageStore;

export function getDWNConfig(
  config: DwnServerConfig,
  tenantGate: TenantGate,
): DwnConfig {
  const dataStore: DataStore = getStore(config.dataStore, EStoreType.DataStore);
  const eventLog: EventLog = getStore(config.eventLog, EStoreType.EventLog);
  const messageStore: MessageStore = getStore(
    config.messageStore,
    EStoreType.MessageStore,
  );

  const eventStream = config.webSocketServerEnabled ? new EventEmitterStream() : undefined;
  return { eventStream, eventLog, dataStore, messageStore, tenantGate };
}

function getLevelStore(
  storeURI: URL,
  storeType: EStoreType,
): DataStore | MessageStore | EventLog {
  switch (storeType) {
    case EStoreType.DataStore:
      return new DataStoreLevel({
        blockstoreLocation: storeURI.host + storeURI.pathname + '/DATASTORE',
      });
    case EStoreType.MessageStore:
      return new MessageStoreLevel({
        blockstoreLocation: storeURI.host + storeURI.pathname + '/MESSAGESTORE',
        indexLocation: storeURI.host + storeURI.pathname + '/INDEX',
      });
    case EStoreType.EventLog:
      return new EventLogLevel({
        location: storeURI.host + storeURI.pathname + '/EVENTLOG',
      });
    default:
      throw new Error('Unexpected level store type');
  }
}

function getDBStore(
  db: Dialect,
  storeType: EStoreType,
): DataStore | MessageStore | EventLog {
  switch (storeType) {
    case EStoreType.DataStore:
      return new DataStoreSql(db);
    case EStoreType.MessageStore:
      return new MessageStoreSql(db);
    case EStoreType.EventLog:
      return new EventLogSql(db);
    default:
      throw new Error('Unexpected db store type');
  }
}

function getStore(
  storeString: string,
  storeType: EStoreType.DataStore,
): DataStore;
function getStore(
  storeString: string,
  storeType: EStoreType.EventLog,
): EventLog;
function getStore(
  storeString: string,
  storeType: EStoreType.MessageStore,
): MessageStore;
function getStore(storeString: string, storeType: EStoreType): StoreType {
  const storeURI = new URL(storeString);

  switch (storeURI.protocol.slice(0, -1)) {
    case BackendTypes.LEVEL:
      return getLevelStore(storeURI, storeType);

    case BackendTypes.SQLITE:
    case BackendTypes.MYSQL:
    case BackendTypes.POSTGRES:
      return getDBStore(getDialectFromURI(storeURI), storeType);

    default:
      throw invalidStorageSchemeMessage(storeURI.protocol);
  }
}

export function getDialectFromURI(u: URL): Dialect {
  switch (u.protocol.slice(0, -1)) {
    case BackendTypes.SQLITE:
      const path = u.host + u.pathname;
      console.log('SQL-lite relative path:', path ? path : undefined); // NOTE, using ? for lose equality comparison

      if (u.host && !fs.existsSync(u.host)) {
        console.log('SQL-lite directory does not exist, creating:', u.host);
        fs.mkdirSync(u.host, { recursive: true });
      }

      return new SqliteDialect({
        database: async () => new Database(path),
      });
    case BackendTypes.MYSQL:
      return new MysqlDialect({
        pool: async () => MySQLCreatePool(u.toString()),
      });
    case BackendTypes.POSTGRES:
      return new PostgresDialect({
        pool: async () => new pg.Pool({ u }),
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
