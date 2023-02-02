import { JsonRpcRouter } from './lib/json-rpc-router.js';
import { handleGetInfo, handleGetList } from './rpc-handlers/aggregator/index.js';
import { handleDwnProcessMessage, handleSubscribe } from './rpc-handlers/dwn/index.js';

export const rpcRouter = new JsonRpcRouter();

rpcRouter.on('aggregator.info', handleGetInfo);
rpcRouter.on('aggregator.list', handleGetList);
rpcRouter.on('dwn.processMessage', handleDwnProcessMessage);
rpcRouter.on('dwn.subscribe', handleSubscribe);
