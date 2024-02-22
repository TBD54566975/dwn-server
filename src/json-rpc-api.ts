import { JsonRpcRouter } from './lib/json-rpc-router.js';

import { handleDwnProcessMessage } from './json-rpc-handlers/dwn/index.js';
import { handleSubscriptionsClose } from './json-rpc-handlers/subscription/index.js';

export const jsonRpcApi = new JsonRpcRouter();

jsonRpcApi.on('dwn.processMessage', handleDwnProcessMessage);
jsonRpcApi.on('rpc.subscribe.dwn.processMessage', handleDwnProcessMessage);

jsonRpcApi.on('rpc.subscribe.close', handleSubscriptionsClose);
