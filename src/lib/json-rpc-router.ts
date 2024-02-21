import type { Dwn, MessageEvent } from '@tbd54566975/dwn-sdk-js';

import type { Readable } from 'node:stream';

import type { JsonRpcId, JsonRpcRequest, JsonRpcResponse } from './json-rpc.js';
import type { SocketConnection } from '../connection/socket-connection.js';

export type RequestContext = {
  transport: 'http' | 'ws';
  dwn: Dwn;
  socketConnection?: SocketConnection;
  subscriptionRequest?: {
    /** The JsonRpcId of the subscription handler */
    id: JsonRpcId; 
    /** The `MessageEvent` handler associated with a subscription request, only used in `ws` requests */
    subscriptionHandler: (message: MessageEvent) => void;
  }
  /** The `Readable` stream associated with a `RecordsWrite` request only used in `http` requests */
  dataStream?: Readable;
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
