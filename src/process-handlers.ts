import type { DwnServer } from './dwn-server.js';

export const gracefulShutdown = (dwnServer: DwnServer): void => {
  dwnServer.stop(() => {
    console.log('http server stopped.. exiting');
    process.exit(0);
  });
};

export const setProcessHandlers = (dwnServer: DwnServer): void => {
  process.on('unhandledRejection', (reason, promise) => {
    console.error(
      `Unhandled promise rejection. Reason: ${reason}. Promise: ${JSON.stringify(
        promise,
      )}`,
    );
  });

  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err.stack || err);
  });

  // triggered by ctrl+c with no traps in between
  process.on('SIGINT', async () => {
    console.log('exit signal received [SIGINT]. starting graceful shutdown');

    gracefulShutdown(dwnServer);
  });

  // triggered by docker, tiny etc.
  process.on('SIGTERM', async () => {
    console.log('exit signal received [SIGTERM]. starting graceful shutdown');

    gracefulShutdown(dwnServer);
  });
};
