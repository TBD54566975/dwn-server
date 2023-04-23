import { JsonRpcRouter } from './lib/json-rpc-router.js';
import { handleDwnProcessMessage } from './rpc-handlers/dwn/index.js';

export const rpcRouter = new JsonRpcRouter();

rpcRouter.on('dwn.processMessage', handleDwnProcessMessage);