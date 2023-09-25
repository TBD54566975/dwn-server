import { v4 as uuidv4 } from 'uuid';
import {
  createJsonRpcErrorResponse,
  createJsonRpcSuccessResponse,
  JsonRpcErrorCodes,
} from '../../lib/json-rpc.js';
import type {
  HandlerResponse,
  RequestContext,
} from '../../lib/json-rpc-router.js';
import type { JsonRpcId, JsonRpcRequest } from '../../lib/json-rpc.js';
import { type KVStore, LocalDiskStore, RedisStore } from './storage.js';

export class Web5Connect {
  private store: KVStore;

  constructor(store: KVStore) {
    if (!store) {
      throw 'refusing to build Web5Connect with no data store';
    }

    this.store = store;
  }

  static async WithStoreUrl(uri: string): Promise<Web5Connect> {
    const storeURI = new URL(uri);
    let store: KVStore;
    switch (storeURI.protocol) {
      case 'file:':
        store = new LocalDiskStore(storeURI.host + storeURI.pathname);
        break;
      case 'redis:':
        store = new RedisStore(uri);
        break;
      default:
        throw 'unsupported connect storage format';
    }

    await store.connect(); // fail early if there are any issues talking to the storage

    return new Web5Connect(store);
  }

  async shutdown(): Promise<void> {
    await this.store.shutdown();
  }

  async handleConnectCreateRequest(
    req: JsonRpcRequest,
    _: RequestContext,
  ): Promise<HandlerResponse> {
    const { message, uuid } = req.params;

    try {
      await this.store.set('request-' + uuid, message);
    } catch (e) {
      return this.error(req.id, JsonRpcErrorCodes.Forbidden, e);
    }

    return this.success(req.id, true);
  }

  async handleConnectGetRequest(
    req: JsonRpcRequest,
    _: RequestContext,
  ): Promise<HandlerResponse> {
    const { uuid } = req.params;

    const message = await this.store.get('request-' + uuid);
    if (message == null) {
      return this.error(req.id, JsonRpcErrorCodes.NotFound, '');
    }

    return this.success(req.id, message);
  }

  async handleConnectCreateGrant(
    req: JsonRpcRequest,
    _: RequestContext,
  ): Promise<HandlerResponse> {
    const { message, id } = req.params;

    await this.store.set('grant-' + id, message);

    return this.success(req.id, true);
  }

  async handleConnectGetGrant(
    req: JsonRpcRequest,
    _: RequestContext,
  ): Promise<HandlerResponse> {
    const { id } = req.params;

    const message = await this.store.get('grant-' + id);
    if (message == null) {
      return this.error(req.id, JsonRpcErrorCodes.NotFound, '');
    }

    return this.success(req.id, message);
  }

  private success(requestID: JsonRpcId | null, message: any): HandlerResponse {
    return {
      jsonRpcResponse: createJsonRpcSuccessResponse(
        requestID || uuidv4(),
        message,
      ),
    };
  }

  private error(
    requestID: JsonRpcId | null,
    code: JsonRpcErrorCodes,
    message: string,
  ): HandlerResponse {
    return {
      jsonRpcResponse: createJsonRpcErrorResponse(
        requestID || uuidv4(),
        code,
        message,
      ),
    };
  }
}
