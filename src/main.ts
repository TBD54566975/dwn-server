#!/usr/bin/env node
// node.js 18 and earlier, needs globalThis.crypto polyfill. needed for dwn-sdk-js
import { webcrypto } from 'node:crypto';

import { DwnServer } from './dwn-server.js';

if (!globalThis.crypto) {
  // @ts-ignore
  globalThis.crypto = webcrypto;
}

const dwnServer = new DwnServer();

await dwnServer.start();
