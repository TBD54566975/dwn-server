import { handleDwnProcessMessage } from './json-rpc-handlers/dwn/index.js';
import { JsonRpcRouter } from './lib/json-rpc-router.js';

export const jsonRpcApi = new JsonRpcRouter();

jsonRpcApi.on('dwn.processMessage', handleDwnProcessMessage);
