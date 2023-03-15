import url from 'node:url';
import { v4 as uuidv4 } from 'uuid';
import { resolve } from '@decentralized-identity/ion-tools';
import { base64url } from 'multiformats/bases/base64';

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

  async sendDWebMessage(message, opts = {}) {
    let { target, data } = opts;

    // TODO: remove monkeypatch. (@moegrammer 03/15/2023)
    // this is a monkeypatch to transmit data associated to a `RecordsWrite` within a structured
    // json object as the body of a request. This is contrary to the direction DWN SDK is headed,
    // which is to put the message (WITHOUT data) into an http header and sending data as
    // raw bytes as the body. I  hope this isn't the route we end up sticking to because
    // it sort of constrains us to explicitly defining how to communicate with a DWN for
    // for each individual transport
    if (data) {
      data = base64url.baseEncode(data);
    }

    const jsonRpcRequest = DwnAggregatorClient.createJsonRpcRequest('dwn.processMessage',
      { message, target, data }
    );

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