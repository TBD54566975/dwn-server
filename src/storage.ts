import { Config } from './config.js';
import { DataStore, EventLog, MessageStore, DwnConfig } from '@tbd54566975/dwn-sdk-js';
import { SqliteDialect, MysqlDialect, PostgresDialect, MessageStoreSql, DataStoreSql, EventLogSql, Dialect } from '@tbd54566975/dwn-sql-store';
import { DataStoreLevel, EventLogLevel, MessageStoreLevel } from '@tbd54566975/dwn-sdk-js/stores';

import Database from 'better-sqlite3';
import { createPool as MySQLCreatePool } from 'mysql2';
import pg from 'pg';
import Cursor from 'pg-cursor';

enum EStoreType {
  DataStore,
  MessageStore,
  EventLog,
}

enum BackendTypes {
  LEVEL = 'level',
  SQLITE = 'sqlite',
  MYSQL = 'mysql',
  POSTGRES = 'postgres',
}

type StoreType = DataStore | EventLog | MessageStore;

export function getDWNConfig(config: Config): DwnConfig {
  let dataStore: DataStore = getStore(config.dataStore, EStoreType.DataStore);
  let eventLog: EventLog = getStore(config.eventLog, EStoreType.EventLog);
  let messageStore: MessageStore = getStore(config.messageStore, EStoreType.MessageStore);

  return { eventLog, dataStore, messageStore };
}

function getLevelStore(storeURI: URL, storeType: EStoreType) {
  switch (storeType) {
  case EStoreType.DataStore:
    return new DataStoreLevel({
      blockstoreLocation: storeURI.host + storeURI.pathname + '/DATASTORE',
    });
  case EStoreType.MessageStore:
    return new MessageStoreLevel({
      blockstoreLocation: storeURI.host + storeURI.pathname + '/DATASTORE',
    });
  case EStoreType.EventLog:
    return new EventLogLevel({
      location: storeURI.host + storeURI.pathname + '/EVENTLOG'
    });
  default:
    throw new Error('Unexpected level store type');
  }
}

function getDBStore(db: Dialect, storeType: EStoreType) {
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

function getStore(storeString: string, storeType: EStoreType.DataStore): DataStore;
function getStore(storeString: string, storeType: EStoreType.EventLog): EventLog;
function getStore(storeString: string, storeType: EStoreType.MessageStore): MessageStore;
function getStore(storeString: string, storeType: EStoreType): StoreType {
  const storeURI = new URL(storeString);

  switch (storeURI.protocol.slice(0, -1)) {
  case BackendTypes.LEVEL:
    return getLevelStore(storeURI, storeType);

  case BackendTypes.SQLITE:
  case BackendTypes.MYSQL:
  case BackendTypes.POSTGRES:
    return getDBStore(getDBFromURI(storeURI), storeType);

  default:
    throw invalidStorageSchemeMessage(storeURI.protocol);
  }
}

function getDBFromURI(u: URL): Dialect {
  switch(u.protocol.slice(0, -1)) {
  case BackendTypes.SQLITE:
    return new SqliteDialect({
      database: async () => new Database(u.host + u.pathname),
    });
  case BackendTypes.MYSQL:
    return new MysqlDialect({
      pool: async () => MySQLCreatePool(u.toString()),
    });
  case BackendTypes.POSTGRES:
    return new PostgresDialect({
      pool   : async () => new pg.Pool({u}),
      cursor : Cursor,
    });
  }
}

function invalidStorageSchemeMessage(protocol: string): string {
  let schemes = [];
  for (const [_, value] of Object.entries(BackendTypes)) {
    schemes.push(value);
  }
  return 'Unknown storage protocol ' + protocol.slice(0, 1) + '! Please use one of: ' + schemes.join(', ') + '. For details, see README';
}
