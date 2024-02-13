import type { GenericMessage, MessageSubscriptionHandler, Persona, UnionMessageReply } from '@tbd54566975/dwn-sdk-js';
import { Cid, DataStream, RecordsWrite } from '@tbd54566975/dwn-sdk-js';

import type { ReadStream } from 'node:fs';
import fs from 'node:fs';
import http from 'node:http';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';
import type { Readable } from 'readable-stream';
import { fileURLToPath } from 'url';
import { WebSocket } from 'ws';

import type { JsonRpcResponse, JsonRpcRequest, JsonRpcId } from '../src/lib/json-rpc.js';
import { createJsonRpcRequest } from '../src/lib/json-rpc.js';
import { JSONRPCSocket } from '../src/json-rpc-socket.js';

// __filename and __dirname are not defined in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type CreateRecordsWriteOverrides =
  | ({
      dataCid?: string;
      dataSize?: number;
      dateCreated?: string;
      published?: boolean;
      recordId?: string;
    } & { data?: never })
  | ({
      dataCid?: never;
      dataSize?: never;
      dateCreated?: string;
      published?: boolean;
      recordId?: string;
    } & { data?: Uint8Array });

export type GenerateProtocolsConfigureOutput = {
  recordsWrite: RecordsWrite;
  dataStream: Readable | undefined;
};

export async function createRecordsWriteMessage(
  signer: Persona,
  overrides: CreateRecordsWriteOverrides = {},
): Promise<GenerateProtocolsConfigureOutput> {
  if (!overrides.dataCid && !overrides.data) {
    overrides.data = randomBytes(32);
  }

  const recordsWrite = await RecordsWrite.create({
    ...overrides,
    dataFormat: 'application/json',
    signer: signer.signer,
  });

  let dataStream: Readable | undefined;
  if (overrides.data) {
    dataStream = DataStream.fromBytes(overrides.data);
  }

  return {
    recordsWrite,
    dataStream,
  };
}

export function randomBytes(length: number): Uint8Array {
  const randomBytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    randomBytes[i] = Math.floor(Math.random() * 256);
  }

  return randomBytes;
}

export async function getFileAsReadStream(
  filePath: string,
): Promise<{ stream: fs.ReadStream; cid: string; size: number }> {
  const absoluteFilePath = `${__dirname}/${filePath}`;

  let readStream = fs.createReadStream(absoluteFilePath);
  const cid = await Cid.computeDagPbCidFromStream(readStream as any);

  let size = 0;
  readStream = fs.createReadStream(absoluteFilePath);
  readStream.on('data', (chunk) => {
    size += chunk['byteLength'];
  });

  return new Promise((resolve) => {
    readStream.on('close', () => {
      return resolve({
        stream: fs.createReadStream(absoluteFilePath),
        cid,
        size,
      });
    });
  });
}

type HttpResponse = {
  status: number;
  headers: http.IncomingHttpHeaders;
  body?: any;
};

export function streamHttpRequest(
  url: string,
  opts: http.RequestOptions,
  bodyStream: ReadStream,
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const request = http.request(url, opts, (rawResponse) => {
      rawResponse.setEncoding('utf8');

      const response: HttpResponse = {
        status: rawResponse.statusCode,
        headers: rawResponse.headers,
      };

      let body = '';
      rawResponse.on('data', (chunk) => {
        body += chunk;
      });

      rawResponse.on('end', () => {
        if (body) {
          response.body = body;
        }

        return resolve(response);
      });
    });

    request.on('error', (e) => {
      return reject(e);
    });

    bodyStream.on('end', () => {
      request.end();
    });

    bodyStream.pipe(request);
  });
}

export async function sendHttpMessage(options: {
  url: string,
  target: string,
  message: GenericMessage,
  data?: any,
}): Promise<UnionMessageReply> {
  const { url, target, message, data } = options;
  // First RecordsWrite that creates the record.
  const requestId = uuidv4();
  const jsonRpcRequest = createJsonRpcRequest(requestId, 'dwn.processMessage', {
    target,
    message,
  });

  const fetchOpts = {
    method  : 'POST',
    headers : {
      'dwn-request': JSON.stringify(jsonRpcRequest)
    }
  };

  if (data !== undefined) {
    fetchOpts.headers['content-type'] = 'application/octet-stream';
    fetchOpts['body'] = data;
  }

  const resp = await fetch(url, fetchOpts);
  let dwnRpcResponse: JsonRpcResponse;

  // check to see if response is in header first. if it is, that means the response is a ReadableStream
  let dataStream;
  const { headers } = resp;
  if (headers.has('dwn-response')) {
    const jsonRpcResponse = JSON.parse(headers.get('dwn-response')) as JsonRpcResponse;

    if (jsonRpcResponse == null) {
      throw new Error(`failed to parse json rpc response. dwn url: ${url}`);
    }

    dataStream = resp.body;
    dwnRpcResponse = jsonRpcResponse;
  } else {
    const responseBody = await resp.text();
    dwnRpcResponse = JSON.parse(responseBody);
  }

  if (dwnRpcResponse.error) {
    const { code, message } = dwnRpcResponse.error;
    throw new Error(`(${code}) - ${message}`);
  }

  const { reply } = dwnRpcResponse.result;
  if (dataStream) {
    reply['record']['data'] = dataStream;
  }

  return reply as UnionMessageReply;
}

export async function sendWsMessage(
  address: string,
  message: any,
): Promise<Buffer> {
  return new Promise((resolve) => {
    const socket = new WebSocket(address);

    socket.onopen = (_event): void => {
      socket.onmessage = (event): void => {
        socket.terminate();
        return resolve(event.data as Buffer);
      };

      socket.send(message);
    };
  });
}

const MAX_RESPONSE_TIMEOUT = 1_500;

export async function subscriptionRequest(
  url: string,
  request: JsonRpcRequest,
  messageHandler: MessageSubscriptionHandler
): Promise<{ status: any, subscription?: { id: string, close: () => Promise<void> } }> {
  let resolved: boolean = false;
  const { id: requestId } = request;
  const connection = await JSONRPCSocket.connect(url);

  const closeSubscription = async (id: JsonRpcId, connection: JSONRPCSocket): Promise<JsonRpcResponse> => {
    const requestId = uuidv4();
    const request = createJsonRpcRequest(requestId, 'subscriptions.close', { id });
    return await connection.request(request);
  }

  return new Promise<{ status: any, subscription?: { id: string, close: () => Promise<void> } }>((resolve, reject) => {
    const { close: subscriptionClose } = connection.subscribe(request, (response) => {
      const { result, error } = response;

      // this is an error specific to the `JsonRpcRequest` requesting the subscription
      if (error) {
        reject(error);
        return;
      }

      // at this point the reply should be DwnRpcResponse
      const { status, record, subscription } = result.reply;
      if (record) {
        messageHandler(record);
        return;
      }
      if (subscription) {
        resolved = true;
        resolve({
          status,
          subscription: {
            ...subscription,
            close: async (): Promise<void> => {
              subscriptionClose();
              const closeResponse = await closeSubscription(requestId, connection);
              if (closeResponse.error?.message !== undefined) {
                throw new Error(`unable to close subscription: ${closeResponse.error.message}`);
              }
            }
          }
        })
      } else {
        resolve({ status });
      }
    });

    setTimeout(() => {
      if (resolved) {
        return;
      };
      return reject('subscription request timeout');
    }, MAX_RESPONSE_TIMEOUT);
  });
}
