import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';

import type { JsonRpcRequest, JsonRpcResponse } from "./lib/json-rpc.js";

// These were arbitrarily chosen, but can be modified via connect options
const CONNECT_TIMEOUT = 3_000;
const RESPONSE_TIMEOUT = 30_000;

export type JSONRPCSocketOptions = {
  connectTimeout?: number;
  responseTimeout?: number;
}

/**
 * JSONRPC Socket Client for WebSocket request/response and long-running subscriptions
 */
export class JSONRPCSocket {
  private constructor(private socket: WebSocket, private responseTimeout: number) {}

  static async connect(url: string, options: JSONRPCSocketOptions = {}): Promise<JSONRPCSocket> {
    const { connectTimeout = CONNECT_TIMEOUT, responseTimeout = RESPONSE_TIMEOUT } = options;

    const onclose = ():void => {
      console.log('json rpc close');
    };

    const onerror = (event: any):void => {
      console.log('json rpc error', event);
    };

    const socket = new WebSocket(url);
    socket.onclose = onclose;
    socket.onerror = onerror;

    return new Promise<JSONRPCSocket>((resolve, reject) => {
      socket.on('open', () => {
        resolve(new JSONRPCSocket(socket, responseTimeout));
      });

      setTimeout(() => reject, connectTimeout);
    });
  }

  close(): void {
    this.socket.close();
  }

  /**
   * Sends a JSON-RPC request through the socket and waits for a single response.
   */
  async request(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      request.id ??= uuidv4();

      const handleResponse = (event: { data: any }):void => {
        const jsonRpsResponse = JSON.parse(event.data.toString()) as JsonRpcResponse;
        if (jsonRpsResponse.id === request.id) {
          // if the incoming response id matches the request id, we will remove the listener and resolve the response
          this.socket.removeEventListener('message', handleResponse);
          return resolve(jsonRpsResponse);
        }
      };

      // subscribe to the listener before sending the request
      this.socket.addEventListener('message', handleResponse);
      this.send(request);

      // reject this promise if we don't receive any response back within the timeout period
      setTimeout(reject, this.responseTimeout);
    });
  }

  /**
   * Sends a JSON-RPC request through the socket and keeps a listener open to read associated responses as they arrive.
   * Returns a close method to clean up the listener.
   */
  subscribe(request: JsonRpcRequest, listener: (response: JsonRpcResponse) => void): { close: () => void } {
    request.id ??= uuidv4();

    const messageHandler = (event: { data: any }):void => {
      const jsonRpcResponse = JSON.parse(event.data.toString()) as JsonRpcResponse;
      if (jsonRpcResponse.id === request.id) {
        // if the incoming response id matches the request id, trigger the listener
        return listener(jsonRpcResponse);
      }
    };

    // subscribe to the listener before sending the request
    this.socket.addEventListener('message', messageHandler);
    this.send(request);

    return {
      close: ():void => {
        // removes the listener for this particular request
        this.socket.removeEventListener('message', messageHandler);
      }
    };
  }

  /**
   * Sends a JSON-RPC request through the socket. You must subscribe to a message listener separately to capture the response.
   */
  send(request: JsonRpcRequest):void {
    return this.socket.send(Buffer.from(JSON.stringify(request)));
  }
}