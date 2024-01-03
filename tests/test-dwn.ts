import { Dwn } from '@tbd54566975/dwn-sdk-js';
import {
  DataStoreSql,
  EventLogSql,
  MessageStoreSql,
} from '@tbd54566975/dwn-sql-store';

import { readFileSync } from 'node:fs';

import { RegisteredTenantGate } from '../src/registered-tenant-gate.js';
import { getDialectFromURI } from '../src/storage.js';

export async function getTestDwn(
  proofOfWorkRequired?: boolean,
  termsOfServiceRequired?: boolean,
): Promise<{
  dwn: Dwn;
  tenantGate: RegisteredTenantGate;
}> {
  const db = getDialectFromURI(new URL('sqlite://'));
  const dataStore = new DataStoreSql(db);
  const eventLog = new EventLogSql(db);
  const messageStore = new MessageStoreSql(db);
  const tenantGate = new RegisteredTenantGate(
    db,
    proofOfWorkRequired,
    termsOfServiceRequired
      ? readFileSync('./tests/fixtures/terms-of-service.txt').toString()
      : undefined,
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
