import type { Request } from 'express';
import type { Readable } from 'readable-stream';
import type { JsonRpcRequest, JsonRpcResponse } from './json-rpc.js';

export type RequestContext = {
  transport?: 'http' | 'ws';
  multipartRequest?: Request
}

export type HandlerResponse = {
  jsonRpcResponse: JsonRpcResponse,
  dataStream?: Readable
}

export type JsonRpcHandler = (JsonRpcRequest: JsonRpcRequest, context: RequestContext) => Promise<HandlerResponse>

export class JsonRpcRouter {
  private methodHandlers: { [method: string]: JsonRpcHandler };

  constructor() {
    this.methodHandlers = {};
  }

  on(methodName: string, handler: JsonRpcHandler) {
    this.methodHandlers[methodName] = handler;
  }

  async handle(rpcRequest: JsonRpcRequest, context: RequestContext = {}) {
    const handler = this.methodHandlers[rpcRequest.method];

    return await handler(rpcRequest, context);
  }
}