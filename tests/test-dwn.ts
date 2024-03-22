import type { TenantGate } from '@tbd54566975/dwn-sdk-js';
import { Dwn, EventEmitterStream } from '@tbd54566975/dwn-sdk-js';
import {
  DataStoreSql,
  EventLogSql,
  MessageStoreSql,
} from '@tbd54566975/dwn-sql-store';

import { getDialectFromURI } from '../src/storage.js';
import { DidDht, DidIon, DidKey, UniversalResolver } from '@web5/dids';

export async function getTestDwn(options: {
  tenantGate?: TenantGate,
  withEvents?: boolean,
} = {}): Promise<Dwn> {
  const { tenantGate, withEvents = false } = options;
  const db = getDialectFromURI(new URL('sqlite://'));
  const dataStore = new DataStoreSql(db);
  const eventLog = new EventLogSql(db);
  const messageStore = new MessageStoreSql(db);
  const eventStream = withEvents ? new EventEmitterStream() : undefined;

  // NOTE: no resolver cache used here to avoid locking LevelDB
  const didResolver = new UniversalResolver({
    didResolvers : [DidDht, DidIon, DidKey],
  });

  let dwn: Dwn;
  try {
    dwn = await Dwn.create({
      eventLog,
      dataStore,
      messageStore,
      eventStream,
      tenantGate,
      didResolver
    });
  } catch (e) {
    throw e;
  }

  return dwn;
}
