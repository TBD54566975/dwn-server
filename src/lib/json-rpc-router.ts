import type { Dwn } from '@tbd54566975/dwn-sdk-js';
import log from 'loglevel';
import type { Readable } from 'node:stream';
import { v4 as uuidv4 } from 'uuid';
import {
  createJsonRpcErrorResponse,
  JsonRpcErrorCodes,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from './json-rpc.js';

export type RequestContext = {
  dwn: Dwn;
  transport: 'http' | 'ws';
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
    let handler = this.methodHandlers[rpcRequest.method];

    if (!handler) {
      handler = JsonRpcRouter.notFoundHandler;
    }

    let resp: HandlerResponse;
    try {
      resp = await handler(rpcRequest, context);
    } catch (e) {
      log.error(
        'uncaught error from',
        rpcRequest.method,
        'handler: ',
        e.stack || e,
      );
      resp = {
        jsonRpcResponse: createJsonRpcErrorResponse(
          rpcRequest.id || uuidv4(),
          JsonRpcErrorCodes.InternalError,
          'internal server error',
        ),
      };
    }
    return resp;
  }

  private static async notFoundHandler(
    rpcRequest: JsonRpcRequest,
  ): Promise<HandlerResponse> {
    return {
      jsonRpcResponse: createJsonRpcErrorResponse(
        rpcRequest.id || uuidv4(),
        JsonRpcErrorCodes.BadRequest,
        'method not supported',
      ),
    };
  }
}
