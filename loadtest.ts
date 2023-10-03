// node.js 18 and earlier, needs globalThis.crypto polyfill. needed for dwn-sdk-js
import { randomUUID, webcrypto } from 'node:crypto';

if (!globalThis.crypto) {
  // @ts-ignore
  globalThis.crypto = webcrypto;
}

import type { Signer } from '@tbd54566975/dwn-sdk-js';
import { DidKeyResolver, Jws, RecordsWrite } from '@tbd54566975/dwn-sdk-js';

const DWN_SERVER = 'http://localhost:3000';

class response {
  status: number;
  time: number;
}
const responses: response[] = [];
let running = true;

async function doAll(iterations: number, vuCount: number): Promise<void> {
  // generate a did:key to use for all tests
  const didKey = await DidKeyResolver.generate();
  const authorizationSigner = Jws.createSigner(didKey);

  const VUs: Promise<void>[] = [];

  for (let i = 0; i < vuCount; i++) {
    VUs.push(doTest(iterations, didKey.did, authorizationSigner));
  }

  writeProgress();
  await Promise.all(VUs);
  running = false;

  let min: number = -1;
  let max: number = -1;
  let total: number = 0;
  const statuses = new Map<number, number>();

  for (const r of responses) {
    if (!statuses.has(r.status)) {
      statuses.set(r.status, 0);
    }

    statuses.set(r.status, statuses.get(r.status)! + 1);

    if (r.time < min || min < 0) {
      min = r.time;
    }

    if (r.time > max) {
      max = r.time;
    }

    total += r.time;
  }

  console.log('\n');
  console.log(`virtual users: ${vuCount}`);
  console.log(`requests per VU: ${iterations}`);
  console.log(`performed ${responses.length} requests:`);
  console.log(`min: ${min}ms`);
  console.log(`max: ${max}ms`);
  console.log(`avg: ${total / responses.length}ms`);

  console.log('\nresponse codes:');
  for (const [status, count] of statuses.entries()) {
    console.log(`${status}: ${count}`);
  }
}

async function rpcRequest(method: string, params): Promise<void> {
  const req = {
    jsonrpc: '2.0',
    id: randomUUID(),
    method: method,
    params: params,
  };

  const start = Date.now();
  const resp = await fetch(DWN_SERVER, {
    method: 'POST',
    headers: { 'dwn-request': JSON.stringify(req) },
  });

  const time = Date.now() - start;

  responses.push({
    status: resp.status,
    time: time,
  });
}

async function doTest(
  iterations: number,
  did: string,
  authorizationSigner: Signer,
): Promise<void> {
  for (let i = 0; i < iterations; i++) {
    // create some data
    const encoder = new TextEncoder();
    const recordsWriteData = encoder.encode('Hello, World!');

    // create a RecordsWrite message
    const { message: recordsWriteMessage } = await RecordsWrite.create({
      data: recordsWriteData,
      published: true,
      authorizationSigner,
      dataFormat: 'text/format',
    });

    await rpcRequest('dwn.processMessage', {
      target: did,
      message: recordsWriteMessage,
    });
  }
}

async function writeProgress(): Promise<void> {
  const start = Date.now();
  while (running) {
    const time = (Date.now() - start) / 1000;
    const rps = responses.length / time;
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(
      `[${Math.round(time)}s] total requests: ${responses.length} (${rps} rps)`,
    );
    await new Promise((r) => setTimeout(r, 1000));
  }
  process.stdout.write('\n');
}

doAll(100, 100);
