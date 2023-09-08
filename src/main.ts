// node.js 18 and earlier, needs globalThis.crypto polyfill. needed for dwn-sdk-js
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) {
  // @ts-ignore
  globalThis.crypto = webcrypto;
}

import { DwnServer } from './dwn-server.js';

const dwnServer = new DwnServer();

await dwnServer.start();
