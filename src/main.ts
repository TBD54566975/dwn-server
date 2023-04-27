import { httpApi } from './http-api.js';
import { config } from './config.js';
import { WsServer } from './ws-server.js';
import { HttpServerShutdownHandler } from './lib/http-server-shutdown-handler.js';


const httpServer = httpApi.listen(config.port, () => {
  console.log(`server listening on port ${config.port}`);
});

const httpServerShutdownHandler = new HttpServerShutdownHandler(httpServer);

if (config.webSocketServerEnabled) {
  const wsServer = new WsServer(httpServer);
  wsServer.listen();
}

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
  httpServerShutdownHandler.stop(() => {
    console.log('http server stopped.. exiting');
    process.exit(0);
  });
}