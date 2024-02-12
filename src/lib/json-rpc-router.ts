import type { Dwn, MessageSubscriptionHandler } from '@tbd54566975/dwn-sdk-js';

import type { Readable } from 'node:stream';

import type { SubscriptionManager } from '../subscription-manager.js';
import type { JsonRpcRequest, JsonRpcResponse } from './json-rpc.js';

export type RequestContext = {
  transport: 'http' | 'ws';
  dwn: Dwn;
  subscriptionManager?: SubscriptionManager;
  dataStream?: Readable;
  subscriptionHandler?: MessageSubscriptionHandler;
};

export type HandlerResponse = {
  jsonRpcResponse: JsonRpcResponse;
  dataStream?: Readable;
};

export type JsonRpcHandler = (
  JsonRpcRequest: JsonRpcRequest,
  context: RequestContext,
) => Promise<HandlerResponse>;

export class JsonRpcRouter {
  private methodHandlers: { [method: string]: JsonRpcHandler };

  constructor() {
    this.methodHandlers = {};
  }

  on(methodName: string, handler: JsonRpcHandler): void {
    this.methodHandlers[methodName] = handler;
  }

  async handle(
    rpcRequest: JsonRpcRequest,
    context: RequestContext,
  ): Promise<HandlerResponse> {
    const handler = this.methodHandlers[rpcRequest.method];

    return await handler(rpcRequest, context);
  }
}
