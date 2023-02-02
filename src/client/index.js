import url from 'node:url';
import { v4 as uuidv4 } from 'uuid';
import { resolve } from '@decentralized-identity/ion-tools';

import { WebSocketClient } from './ws.js';
import { HttpClient } from './http.js';

export class DwnAggregatorClient {
  constructor(aggregators) {
    this.aggregators = aggregators;
  }

  static async create(aggregatorURIs) {
    const aggregators = [];
    
    for (let uri of aggregatorURIs) {
      const { protocol } = url.parse(uri);

      if (!protocol) {
        continue;
      }

      const aggregator = {};

      if (protocol === 'did:') {
        // TODO: resolve DID and nab aggregator hosts from service property. push onto end of aggregatorURIs
        continue;
      } else if (protocol === 'http:' || protocol === 'https:') {
        aggregator.http = uri;
        aggregator.transportClient = HttpClient.create(uri);

      } else if (protocol === 'ws:' || protocol === 'wss:') {
        aggregator.ws = uri;
        aggregator.transportClient = await WebSocketClient.create(uri);
      }

      aggregators.push(aggregator);
    }

    return new DwnAggregatorClient(aggregators);
  }

  async sendDWebMessage(message, target) {
    const jsonRpcRequest = DwnAggregatorClient.createJsonRpcRequest('dwn.processMessage', { message, target });

    //! : only sending to 1 aggregator for now
    const aggregator = this.aggregators[0];
    
    return await aggregator.transportClient.send(jsonRpcRequest);
  }

  async subscribe(filter, callback) {
    
    //! : only subscribing to 1 aggregator for now
    const aggregator = this.aggregators[0];
    const { transportClient } = aggregator;
    
    if (!transportClient.subscribe) {
      throw new Error('transport does not support subscribing');
    }
    
    const jsonRpcRequest = DwnAggregatorClient.createJsonRpcRequest('dwn.subscribe', { filter });
    return await transportClient.subscribe(jsonRpcRequest, callback);
  }

  static createJsonRpcRequest(method, params) {
    return {
      jsonrpc : '2.0',
      id      : uuidv4(),
      method,
      params,
    };
  }
}