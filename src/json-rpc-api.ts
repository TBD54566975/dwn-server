import { handleDwnProcessMessage } from './json-rpc-handlers/dwn/index.js';
import {
  handleConnectCreateGrant,
  handleConnectCreateRequest,
  handleConnectGetGrant,
  handleConnectGetRequest,
} from './json-rpc-handlers/connect/index.js';

import { JsonRpcRouter } from './lib/json-rpc-router.js';

export const jsonRpcApi = new JsonRpcRouter();

jsonRpcApi.on('dwn.processMessage', handleDwnProcessMessage);

jsonRpcApi.on('connect.createRequest', handleConnectCreateRequest);
jsonRpcApi.on('connect.getRequest', handleConnectGetRequest);
jsonRpcApi.on('connect.createGrant', handleConnectCreateGrant);
jsonRpcApi.on('connect.getGrant', handleConnectGetGrant);
