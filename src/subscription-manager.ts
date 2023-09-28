import type { Dwn, SubscriptionFilter } from '@tbd54566975/dwn-sdk-js';
import type { EventMessage, PermissionsGrant } from '@tbd54566975/dwn-sdk-js';

import type { JsonRpcSuccessResponse } from './lib/json-rpc.js';
import { SubscriptionRequest } from '@tbd54566975/dwn-sdk-js';
import type { SubscriptionRequestReply } from '@tbd54566975/dwn-sdk-js';
import type WebSocket from 'ws';
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';

export class Subscription {
  from?: string;
  subscriptionId: string;
  createdAt: string;
  description: string;
  filters?: SubscriptionFilter[];
  permissionGrant: PermissionsGrant;
  connection: WebSocket;
}

export interface SubscriptionController {
  clear(): Promise<void>;
  close(): Promise<void>;
  start(): Promise<void>;
  subscribe(
    request: RegisterSubscriptionRequest,
  ): Promise<RegisterSubscriptionReply>;
}

export type RegisterSubscriptionRequest = {
  from: string;
  socket: WebSocket;
  filters?: SubscriptionFilter[];
  permissionGrant?: PermissionsGrant;
  request: SubscriptionRequest;
};

export type RegisterSubscriptionReply = {
  reply: SubscriptionRequestReply;
  subscriptionId?: string;
};

export type defaultSubscriptionChannel = 'event';

export type SubscriptionManagerOptions = {
  wss?: WebSocketServer;
  dwn: Dwn;
  tenant: string;
};

export class SubscriptionManager {
  private wss: WebSocketServer;
  private dwn: Dwn;
  private connections: Map<string, Subscription>;
  private tenant: string;
  options: SubscriptionManagerOptions;
  #open: boolean;

  constructor(options?: SubscriptionManagerOptions) {
    this.wss = options?.wss || new WebSocketServer();
    this.connections = new Map();
    this.tenant = options?.tenant;
    this.dwn = options?.dwn;
    this.options = options;

    this.wss.on('connection', (socket: WebSocket) => {
      console.log('connected');
      socket.on('message', async (data) => {
        console.log('got message...');
        await this.handleSubscribe(socket, data);
      });
    });
  }

  async clear(): Promise<void> {
    this.wss.removeAllListeners();
    this.connections.clear();
  }

  async close(): Promise<void> {
    this.#open = false;
    this.connections.clear();
    this.wss.close();
  }

  async open(): Promise<void> {
    this.#open = true;
  }

  async start(): Promise<void> {
    this.open();
  }

  private async createSubscription(
    from: string,
    request: RegisterSubscriptionRequest,
  ): Promise<Subscription> {
    return {
      from,
      subscriptionId: uuidv4(),
      createdAt: new Date().toISOString(),
      description: 'subscription',
      filters: request.filters,
      permissionGrant: request.permissionGrant,
      connection: request.socket,
    };
  }

  async handleSubscribe(
    socket: WebSocket,
    data: any,
  ): Promise<RegisterSubscriptionReply> {
    // parse message
    const req = await SubscriptionRequest.parse(data);

    return await this.subscribe({
      request: req,
      socket: socket,
      from: req.author,
    });
  }

  createJSONRPCEvent(e: EventMessage): JsonRpcSuccessResponse {
    return {
      id: uuidv4(),
      jsonrpc: '2.0',
      result: e,
    };
  }

  async subscribe(
    req: RegisterSubscriptionRequest,
  ): Promise<RegisterSubscriptionReply> {
    const subscriptionReply = await this.dwn.handleSubscriptionRequest(
      this.tenant,
      req.request.message,
    );
    if (subscriptionReply.status.code !== 200) {
      return { reply: subscriptionReply };
    }
    const subscription = await this.createSubscription(req.from, req);
    this.registerSubscription(subscription);
    // set up forwarding.
    subscriptionReply.subscription.emitter.on(
      async (e: EventMessage): Promise<void> => {
        const jsonRpcResponse = this.createJSONRPCEvent(e);
        const str = JSON.stringify(jsonRpcResponse);
        return req.socket.send(Buffer.from(str));
      },
    );
  }

  private async registerSubscription(
    subscription: Subscription,
  ): Promise<void> {
    if (!this.#open) {
      throw new Error("Can't register subscription. It's not opened.");
    }
    if (this.connections.has(subscription.subscriptionId)) {
      throw new Error(
        'Failed to add connection to controller. ID already exists.',
      );
    }
    this.connections.set(subscription.subscriptionId, subscription);
    subscription.connection.on('close', () => {
      this.deleteSubscription(subscription.subscriptionId);
    });
  }

  private async deleteSubscription(id: string): Promise<void> {
    this.connections.delete(id);
  }
}
