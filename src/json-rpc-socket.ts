import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';

import type { JsonRpcRequest, JsonRpcResponse } from "./lib/json-rpc.js";

const CONNECT_TIMEOUT = 3_000;

export class JSONRPCSocket {
  private isOpen = false;
  constructor(private socket: WebSocket) {
    socket.onopen = this.open;
  }

  static async connect(url: string): Promise<JSONRPCSocket> {

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
        resolve(new JSONRPCSocket(socket));
      });

      setTimeout(() => reject, CONNECT_TIMEOUT);
    });
  }

  open(): void {
    this.isOpen = true;
  }

  close(): void {
    this.isOpen = false;
    this.socket.close();
  }

  /**
   * Sends a JSON-RPC request through the socket. You must subscribe to a message listener separately to capture the response.
   */
  send(request: JsonRpcRequest):void {
    return this.socket.send(Buffer.from(JSON.stringify(request)));
  }

  subscribe(request: JsonRpcRequest, listener: (response: JsonRpcResponse) => void): { close: () => void } {
    request.id ??= uuidv4();

    const messageHandler = (event: { data: any }):void => {
      const jsonRpcResponse = JSON.parse(event.data.toString()) as JsonRpcResponse;
      if (jsonRpcResponse.id === request.id) {
        return listener(jsonRpcResponse);
      }
    };

    this.socket.addEventListener('message', messageHandler);
    this.send(request);

    return {
      close: ():void => {
        this.socket.removeEventListener('message', messageHandler);
      }
    };
  }

  async request(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    return new Promise((resolve) => {
      request.id ??= uuidv4();

      const handleResponse = (event: { data: any }):void => {
        const jsonRpsResponse = JSON.parse(event.data.toString()) as JsonRpcResponse;
        if (jsonRpsResponse.id === request.id) {
          this.socket.removeEventListener('message', handleResponse);
          return resolve(jsonRpsResponse);
        }
      };

      this.socket.addEventListener('message', handleResponse);
      this.send(request);
    });
  }
}