import { Dwn } from '@tbd54566975/dwn-sdk-js';
import {
  DataStoreSql,
  EventLogSql,
  MessageStoreSql,
} from '@tbd54566975/dwn-sql-store';

import { readFileSync } from 'node:fs';

import { getDialectFromURI } from '../src/storage.js';
import { TenantGate } from '../src/tenant-gate.js';

export async function getTestDwn(
  powRequired?: boolean,
  tosRequired?: boolean,
): Promise<{
  dwn: Dwn;
  tenantGate: TenantGate;
}> {
  const db = getDialectFromURI(new URL('sqlite://'));
  const dataStore = new DataStoreSql(db);
  const eventLog = new EventLogSql(db);
  const messageStore = new MessageStoreSql(db);
  const tenantGate = new TenantGate(
    db,
    powRequired,
    tosRequired,
    tosRequired ? readFileSync('./tests/fixtures/tos.txt').toString() : null,
    true,
  );

  let dwn: Dwn;
  try {
    dwn = await Dwn.create({
      eventLog,
      dataStore,
      messageStore,
      tenantGate,
    });
  } catch (e) {
    throw e;
  }

  return { dwn, tenantGate };
}
