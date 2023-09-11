import type { Dwn } from '@tbd54566975/dwn-sdk-js';
import opentelemetry from '@opentelemetry/api';
import type { Readable } from 'node:stream';
import {
  createJsonRpcErrorResponse,
  JsonRpcErrorCodes,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from './json-rpc.js';

const tracer = opentelemetry.trace.getTracer('dwn-server');

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
    const handler = this.methodHandlers[rpcRequest.method];
    if (!handler) {
      return {
        jsonRpcResponse: createJsonRpcErrorResponse(
          rpcRequest.id,
          JsonRpcErrorCodes.BadRequest,
          'unknown method',
        ),
      };
    }

    return new Promise<HandlerResponse>(async (resolve) => {
      tracer.startActiveSpan('rpc-handler', async (span) => {
        span.setAttribute('method', rpcRequest.method);
        const resp = await handler(rpcRequest, context);
        resolve(resp);
        span.end();
      });
    });
  }
}
