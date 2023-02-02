import { WebSocket } from 'ws';
import { EventEmitter } from 'node:events';

export class WebSocketClient {
  /**
   * 
   * @param {WebSocket} socket 
   */
  constructor(socket) {
    this.socket = socket;
    this.responseEmitter = new EventEmitter();
    this.subscriptionEmitter = new EventEmitter();
    this.subscriptionIds = new Set();
    
    this.socket.onmessage = event => {
      const jsonRpcResult = JSON.parse(event.data);
      
      if (this.subscriptionIds.has(jsonRpcResult.id)) {
        this.subscriptionEmitter.emit(jsonRpcResult.id, jsonRpcResult);
      } else {
        this.responseEmitter.emit(jsonRpcResult.id, jsonRpcResult);
      }
    };
  }

  static async create(host) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(host);
      
      socket.onopen = event => {
        const client = new WebSocketClient(socket);
        return resolve(client);
      };
    });
  }

  send(jsonRpcRequest) {
    return new Promise((resolve, reject) => {
      this.responseEmitter.once(jsonRpcRequest.id, (jsonRpcResponse) => {
        return resolve(jsonRpcResponse);
      });
      
      this.socket.send(JSON.stringify(jsonRpcRequest));
    });
  }

  async subscribe(jsonRpcRequest, callback) {
    const subscriptionOk = await this.send(jsonRpcRequest);

    if (subscriptionOk.error) {
      return subscriptionOk;
    }

    this.subscriptionIds.add(jsonRpcRequest.id);
    this.subscriptionEmitter.on(jsonRpcRequest.id, callback);

    return subscriptionOk;
  }
}