import { httpApi } from './http-api.js';
import { config } from './config.js';
import { wsServer } from './ws-server.js';
import { HttpServer } from './http-server.js';

const httpServer = new HttpServer(httpApi);

httpServer.listen(config.port, () => {
  console.log(`server listening on ${config.port}`);
});

// handle connection upgrade to ws:
httpServer.onUpgrade((request, socket, firstPacket) => {
  wsServer.handleUpgrade(request, socket, firstPacket, (socket) => {
    wsServer.emit('connection', socket, request);
  });
});

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
  // TODO: add moar graceful shutdown logic here (Moe - 02/01/2023).
  httpServer.stop(() => {
    console.log('http server stopped');

    console.log('exiting...');
    process.exit(0);
  });
}