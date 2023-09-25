import { handleDwnProcessMessage } from './json-rpc-handlers/dwn/index.js';

import { JsonRpcRouter } from './lib/json-rpc-router.js';
import type { Web5Connect } from './json-rpc-handlers/connect/connect.js';

export function getJsonRpcApi(connect?: Web5Connect): JsonRpcRouter {
  const jsonRpcApi = new JsonRpcRouter();

  jsonRpcApi.on('dwn.processMessage', handleDwnProcessMessage);

  if (connect) {
    jsonRpcApi.on(
      'connect.createRequest',
      connect.handleConnectCreateRequest.bind(connect),
    );
    jsonRpcApi.on(
      'connect.getRequest',
      connect.handleConnectGetRequest.bind(connect),
    );
    jsonRpcApi.on(
      'connect.createGrant',
      connect.handleConnectCreateGrant.bind(connect),
    );
    jsonRpcApi.on(
      'connect.getGrant',
      connect.handleConnectGetGrant.bind(connect),
    );
  }

  return jsonRpcApi;
}
