import { json } from 'express';
import { DwnServer } from './dwn-server.js';
import { setProcessHandlers } from './process-handlers.js';

const dwnServer = new DwnServer();
await dwnServer.listen();

setProcessHandlers(dwnServer);
