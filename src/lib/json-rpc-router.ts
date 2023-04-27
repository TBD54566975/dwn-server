import type { Request } from 'express';
import type { Dwn } from '@tbd54566975/dwn-sdk-js';
import type { Readable } from 'readable-stream';
import type { JsonRpcRequest, JsonRpcResponse } from './json-rpc.js';

type HttpRequest = {
  contentType: 'application/octet-stream' | 'multipart/form-data';
  request: Request;
};

export type RequestContext = {
  dwn: Dwn;
  transport?: 'http' | 'ws';
} & (HttpRequest | { [K in keyof HttpRequest]?: never; });

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

  async handle(rpcRequest: JsonRpcRequest, context: RequestContext) {
    const handler = this.methodHandlers[rpcRequest.method];

    return await handler(rpcRequest, context);
  }
}