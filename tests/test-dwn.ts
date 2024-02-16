import type { TenantGate } from '@tbd54566975/dwn-sdk-js';
import { Dwn } from '@tbd54566975/dwn-sdk-js';
import {
  DataStoreSql,
  EventLogSql,
  MessageStoreSql,
} from '@tbd54566975/dwn-sql-store';

import { getDialectFromURI } from '../src/storage.js';
import { DidDht, DidIon, DidKey, DidResolver } from '@web5/dids';

export async function getTestDwn(
  tenantGate?: TenantGate
): Promise<Dwn> {

  // NOTE: no resolver cache used here to avoid locking LevelDB
  const didResolver = new DidResolver({
    didResolvers : [DidDht, DidIon, DidKey],
  });

  const db = getDialectFromURI(new URL('sqlite://'));
  const dataStore = new DataStoreSql(db);
  const eventLog = new EventLogSql(db);
  const messageStore = new MessageStoreSql(db);

  let dwn: Dwn;
  try {
    dwn = await Dwn.create({
      eventLog,
      dataStore,
      messageStore,
      tenantGate,
      didResolver
    });
  } catch (e) {
    throw e;
  }

  return dwn;
}
