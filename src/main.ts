// node.js 18 and earlier, needs globalThis.crypto polyfill. needed for dwn-sdk-js
import { webcrypto } from 'node:crypto';

// @ts-ignore
if (!globalThis.crypto) globalThis.crypto = webcrypto;

import { DwnServer } from './dwn-server.js';

const dwnServer = new DwnServer();
await dwnServer.listen();

process.on('unhandledRejection', (reason, promise) => {
  console.error(`Unhandled promise rejection. Reason: ${reason}. Promise: ${JSON.stringify(promise)}`);
});

process.on('uncaughtException', err => {
  console.error('Uncaught exception:', (err.stack || err));
});

// triggered by ctrl+c with no traps in between
process.on('SIGINT', async () => {
  console.log('exit signal received [SIGINT]. starting graceful shutdown');

  gracefulShutdown();
});

// triggered by docker, tiny etc.
process.on('SIGTERM', async () => {
  console.log('exit signal received [SIGTERM]. starting graceful shutdown');

  gracefulShutdown();
});

function gracefulShutdown() {
  dwnServer.stop(() => {
    console.log('http server stopped.. exiting');
    process.exit(0);
  });
}
