import log from 'loglevel';
import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';

import type { JsonRpcId, JsonRpcRequest, JsonRpcResponse } from "./lib/json-rpc.js";
import { createJsonRpcSubscriptionRequest } from "./lib/json-rpc.js";

// These were arbitrarily chosen, but can be modified via connect options
const CONNECT_TIMEOUT = 3_000;
const RESPONSE_TIMEOUT = 30_000;

export interface JsonRpcSocketOptions {
  /** socket connection timeout in milliseconds */
  connectTimeout?: number;
  /** response timeout for rpc requests in milliseconds */
  responseTimeout?: number;
  /** optional connection close handler */
  onclose?: () => void;
  /** optional socket error handler */
  onerror?: (error?: any) => void;
}

/**
 * JSON RPC Socket Client for WebSocket request/response and long-running subscriptions.
 */
export class JsonRpcSocket {
  private constructor(private socket: WebSocket, private responseTimeout: number) {}

  static async connect(url: string, options: JsonRpcSocketOptions = {}): Promise<JsonRpcSocket> {
    const { connectTimeout = CONNECT_TIMEOUT, responseTimeout = RESPONSE_TIMEOUT, onclose, onerror } = options;

    const socket = new WebSocket(url);

    socket.onclose = onclose;
    socket.onerror = onerror;

    if (socket.onclose === undefined) {
      socket.onclose = ():void => {
        log.info(`JSON RPC Socket close ${url}`);
      }
    }

    if (socket.onerror === undefined) {
      socket.onerror = (error?: any):void => {
        log.error(`JSON RPC Socket error ${url}`, error);
      }
    }

    return new Promise<JsonRpcSocket>((resolve, reject) => {
      socket.on('open', () => {
        resolve(new JsonRpcSocket(socket, responseTimeout));
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
      setTimeout(() => {
        this.socket.removeEventListener('message', handleResponse);
        reject(new Error('request timed out'));
      }, this.responseTimeout);
    });
  }

  /**
   * Sends a JSON-RPC request through the socket and keeps a listener open to read associated responses as they arrive.
   * Returns a close method to clean up the listener.
   */
  async subscribe(request: JsonRpcRequest, listener: (response: JsonRpcResponse) => void): Promise<{
    response: JsonRpcResponse;
    close?: () => Promise<void>;
   }> {

    if (!request.method.startsWith('rpc.subscribe.')) {
      throw new Error('subscribe rpc requests must include the `rpc.subscribe` prefix');
    }

    if (!request.subscription) {
      throw new Error('subscribe rpc requests must include subscribe options');
    }

    const subscriptionId = request.subscription.id;
    const socketEventListener = (event: { data: any }):void => {
      const jsonRpcResponse = JSON.parse(event.data.toString()) as JsonRpcResponse;
      if (jsonRpcResponse.id === subscriptionId) {
        if (jsonRpcResponse.error !== undefined) {
          // remove the event listener upon receipt of a JSON RPC Error.
          this.socket.removeEventListener('message', socketEventListener);
          this.closeSubscription(subscriptionId);
        }
        listener(jsonRpcResponse);
      }
    };
    this.socket.addEventListener('message', socketEventListener);

    const response = await this.request(request);
    if (response.error) {
      this.socket.removeEventListener('message', socketEventListener);
      return { response }
    }

    // clean up listener and create a `rpc.subscribe.close` message to use when closing this JSON RPC subscription
    const close = async (): Promise<void> => {
      this.socket.removeEventListener('message', socketEventListener);
      await this.closeSubscription(subscriptionId);
    }

    return {
      response,
      close
    }
  }

  private closeSubscription(id: JsonRpcId): Promise<JsonRpcResponse> {
    const requestId = uuidv4();
    const request = createJsonRpcSubscriptionRequest(requestId, 'rpc.subscribe.close', {}, id);
    return this.request(request);
  }

  /**
   * Sends a JSON-RPC request through the socket. You must subscribe to a message listener separately to capture the response.
   */
  send(request: JsonRpcRequest):void {
    this.socket.send(Buffer.from(JSON.stringify(request)));
  }
}