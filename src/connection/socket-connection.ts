import type { Dwn, GenericMessage } from "@tbd54566975/dwn-sdk-js";
import { DwnMethodName } from "@tbd54566975/dwn-sdk-js";

import type { WebSocket } from "ws";
import log from 'loglevel';
import { v4 as uuidv4 } from 'uuid';

import type { RequestContext } from "../lib/json-rpc-router.js";
import type { JsonRpcErrorResponse, JsonRpcId, JsonRpcRequest, JsonRpcResponse } from "../lib/json-rpc.js";

import { requestCounter } from "../metrics.js";
import { jsonRpcApi } from "../json-rpc-api.js";
import { JsonRpcErrorCodes, createJsonRpcErrorResponse, createJsonRpcSuccessResponse } from "../lib/json-rpc.js";
import { DwnServerError, DwnServerErrorCode } from "../dwn-error.js";

const HEARTBEAT_INTERVAL = 30_000;

export interface JsonRpcSubscription {
  /** JSON RPC Id of the Subscription Request */
  id: JsonRpcId;
  close: () => Promise<void>;
}

/**
 * SocketConnection handles a WebSocket connection to a DWN using JSON RPC.
 * It also manages references to the long running RPC subscriptions for the connection.
 */
export class SocketConnection {
  private heartbeatInterval: NodeJS.Timer;
  private subscriptions: Map<JsonRpcId, JsonRpcSubscription> = new Map();
  private isAlive: boolean;

  constructor(
    private socket: WebSocket,
    private dwn: Dwn
  ){
    socket.on('message', this.message.bind(this));
    socket.on('close', this.close.bind(this));
    socket.on('error', this.error.bind(this));
    socket.on('pong', this.pong.bind(this));

    // Sometimes connections between client <-> server can get borked in such a way that
    // leaves both unaware of the borkage. ping messages can be used as a means to verify
    // that the remote endpoint is still responsive. Server will ping each socket every 30s
    // if a pong hasn't received from a socket by the next ping, the server will terminate
    // the socket connection
    this.isAlive = true;
    this.heartbeatInterval = setInterval(() => {
      if (this.isAlive === false) {
        this.close();
      }
      this.isAlive = false;
      this.socket.ping();
    }, HEARTBEAT_INTERVAL);
  }

  /**
   * Adds a reference for the JSON RPC Subscription to this connection.
   * Used for cleanup if the connection is closed.
   */
  async addSubscription(subscription: JsonRpcSubscription): Promise<void> {
    if (this.subscriptions.has(subscription.id)) {
      throw new DwnServerError(
        DwnServerErrorCode.ConnectionSubscriptionJsonRpcIdExists,
        `the subscription with id ${subscription.id} already exists`
      )
    }

    this.subscriptions.set(subscription.id, subscription);
  }

  /**
   * Closes and removes the reference for a given subscription from this connection.
   *
   * @param id the `JsonRpcId` of the JSON RPC subscription request.
   */
  async closeSubscription(id: JsonRpcId): Promise<void> {
    if (!this.subscriptions.has(id)) {
      throw new DwnServerError(
        DwnServerErrorCode.ConnectionSubscriptionJsonRpcIdNotFound,
        `the subscription with id ${id} was not found`
      )
    }

    const connection = this.subscriptions.get(id);
    await connection.close();
    this.subscriptions.delete(id);
  }

  /**
   * Closes the existing connection and cleans up any listeners or subscriptions.
   */
  async close(): Promise<void> {
    clearInterval(this.heartbeatInterval);
    // clean up all socket event listeners
    this.socket.removeAllListeners();

    const closePromises = [];
    for (const [id, subscription] of this.subscriptions) {
      closePromises.push(subscription.close());
      this.subscriptions.delete(id);
    }

    // close all of the associated subscriptions
    await Promise.all(closePromises);

    // close the socket.
    this.socket.close();
  }

  /**
   * Pong messages are automatically sent in response to ping messages as required by
   * the websocket spec. So, no need to send explicit pongs.
   */
  private pong(): void {
    this.isAlive = true;
  }

  /**
   * Log the error and close the connection.
   */
  private async error(error:Error): Promise<void>{
    log.error(`SocketConnection error, terminating connection`, error);
    this.socket.terminate();
    await this.close();
  }

  /**
   * Handles a `JSON RPC 2.0` encoded message.
   */
  private async message(dataBuffer: Buffer): Promise<void> {
    const requestData = dataBuffer.toString();
    if (!requestData) {
      return this.send(createJsonRpcErrorResponse(
        uuidv4(),
        JsonRpcErrorCodes.BadRequest,
        'request payload required.'
      ))
    }

    let jsonRequest: JsonRpcRequest;
    try {
      jsonRequest = JSON.parse(requestData);
    } catch(error) {
      const errorResponse = createJsonRpcErrorResponse(
        uuidv4(),
        JsonRpcErrorCodes.BadRequest,
        (error as Error).message
      );

      return this.send(errorResponse);
    };

    const requestContext = await this.buildRequestContext(jsonRequest);
    const { jsonRpcResponse } = await jsonRpcApi.handle(jsonRequest, requestContext);
    if (jsonRpcResponse.error) {
      requestCounter.inc({ method: jsonRequest.method, error: 1 });
    } else {
      requestCounter.inc({
        method: jsonRequest.method,
        status: jsonRpcResponse?.result?.reply?.status?.code || 0,
      });
    }
    this.send(jsonRpcResponse);
  }

  /**
   * Sends a JSON encoded Buffer through the Websocket. Accepts a callback, if none is provided an error logger is used.
   */
  private send(response: JsonRpcResponse | JsonRpcErrorResponse, cb?: (error?: Error) => void): void {
    if (!cb) {
      cb = (error):void => {
        if(error) { log.error('socket send error', error, response); }
      }
    }

    this.socket.send(Buffer.from(JSON.stringify(response)), cb);
  }

  /**
   * Creates a subscription handler to send messages matching the subscription requested.
   *
   * Wraps the incoming `message` in a `JSON RPC Success Response` using the original subscription`JSON RPC Id` to send through the WebSocket.
   */
  private createSubscriptionHandler(id: JsonRpcId): (message: GenericMessage) => void {
    return (message) => {
      const response = createJsonRpcSuccessResponse(id, { reply: {
        record : message
      } });
      this.send(response);
    }
  }

  /**
   * Builds a `RequestContext` object to use with the `JSON RPC API`.
   *
   * Adds a `subscriptionHandler` for `Subscribe` messages.
   */
  private async buildRequestContext(request: JsonRpcRequest): Promise<RequestContext> {
    const { id, params, method } = request;
    const requestContext: RequestContext = {
      transport        : 'ws',
      dwn              : this.dwn,
      socketConnection : this,
    }

    if (method === 'dwn.processMessage') {
      const { message } = params as { message: GenericMessage };
      if (message.descriptor.method === DwnMethodName.Subscribe) {
        requestContext.subscriptionHandler = this.createSubscriptionHandler(id).bind(this);
      }
    }

    return requestContext;
  }
}
