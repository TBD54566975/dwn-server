import type { TenantGate } from '@tbd54566975/dwn-sdk-js';

import { getDialectFromUrl } from '../src/storage.js';
import {
  DataStoreSql,
  EventLogSql,
  MessageStoreSql,
  ResumableTaskStoreSql,
} from '@tbd54566975/dwn-sql-store';
import { DidDht, DidIon, DidKey, UniversalResolver } from '@web5/dids';
import { Dwn, EventEmitterStream } from '@tbd54566975/dwn-sdk-js';

export async function getTestDwn(options: {
  tenantGate?: TenantGate,
  withEvents?: boolean,
} = {}): Promise<Dwn> {
  const { tenantGate, withEvents = false } = options;
  const dialect = getDialectFromUrl(new URL('sqlite://'));
  const dataStore = new DataStoreSql(dialect);
  const eventLog = new EventLogSql(dialect);
  const messageStore = new MessageStoreSql(dialect);
  const resumableTaskStore = new ResumableTaskStoreSql(dialect);
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
      resumableTaskStore,
      eventStream,
      tenantGate,
      didResolver
    });
  } catch (e) {
    throw e;
  }

  return dwn;
}
