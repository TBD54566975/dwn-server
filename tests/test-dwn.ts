import type { TenantGate } from '@tbd54566975/dwn-sdk-js';
import { Dwn } from '@tbd54566975/dwn-sdk-js';
import {
  DataStoreSql,
  EventLogSql,
  MessageStoreSql,
} from '@tbd54566975/dwn-sql-store';

import { getDialectFromURI } from '../src/storage.js';

export async function getTestDwn(
  tenantGate?: TenantGate
): Promise<Dwn> {
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
      tenantGate
    });
  } catch (e) {
    throw e;
  }

  return dwn;
}
