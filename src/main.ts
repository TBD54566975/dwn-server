// node.js 18 and earlier, needs globalThis.crypto polyfill. needed for dwn-sdk-js
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) {
  // @ts-ignore
  globalThis.crypto = webcrypto;
}

import { config } from './config.js';
import { DwnServer } from './dwn-server.js';
import { initializeConnect } from './json-rpc-handlers/connect/connect.js';

initializeConnect(config.connectStore);

const dwnServer = new DwnServer();

await dwnServer.start();
