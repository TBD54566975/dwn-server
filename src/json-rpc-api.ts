import { JsonRpcRouter } from './lib/json-rpc-router.js';

import { handleDwnProcessMessage } from './json-rpc-handlers/dwn/index.js';
import { handleSubscriptionsClose } from './json-rpc-handlers/subscription/index.js';

export const jsonRpcRouter = new JsonRpcRouter();

jsonRpcRouter.on('dwn.processMessage', handleDwnProcessMessage);
jsonRpcRouter.on('rpc.subscribe.dwn.processMessage', handleDwnProcessMessage);

jsonRpcRouter.on('rpc.subscribe.close', handleSubscriptionsClose);
