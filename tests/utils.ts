import type { SignatureInput, PublicJwk, PrivateJwk } from '@tbd54566975/dwn-sdk-js';

import path from 'path';
import fs from 'node:fs';
import http from 'node:http';

import { WebSocket } from 'ws';
import { ReadStream } from 'node:fs';
import { fileURLToPath } from 'url';
import { DidKeyResolver, RecordsWrite, DataStream, Cid } from '@tbd54566975/dwn-sdk-js';

// __filename and __dirname are not defined in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type Profile = {
  did: string;
  keyPair: {
    publicJwk: PublicJwk,
    privateJwk: PrivateJwk
  } ,
  signatureInput: SignatureInput
}

export async function createProfile(): Promise<Profile> {
  const { did, keyPair, keyId } = await DidKeyResolver.generate();

  // signatureInput is required by all dwn message classes. it's used to sign messages
  const signatureInput = {
    privateJwk      : keyPair.privateJwk,
    protectedHeader : { alg: keyPair.privateJwk.alg, kid: `${did}#${keyId}` }
  };

  return {
    did,
    keyPair,
    signatureInput
  };
}

export type CreateRecordsWriteOverrides = ({ dataSize?: number; dataCid?: string } & { data?: never }) | ({ dataSize?: never; dataCid?: never } & { data?: Uint8Array });

export async function createRecordsWriteMessage(signer: Profile, overrides: CreateRecordsWriteOverrides = {}) {
  if (!overrides.dataCid && !overrides.data) {
    overrides.data = randomBytes(32);
  }

  const recordsWrite = await RecordsWrite.create({
    ...overrides,
    dataFormat                  : 'application/json',
    authorizationSignatureInput : signer.signatureInput,
  });


  let dataStream;
  if (overrides.data) {
    dataStream = DataStream.fromBytes(overrides.data);
  }

  return {
    recordsWrite,
    dataStream
  };
}


export function randomBytes(length: number): Uint8Array {
  const randomBytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    randomBytes[i] = Math.floor(Math.random() * 256);
  }

  return randomBytes;
}

export async function getFileAsReadStream(filePath: string): Promise<{ stream: fs.ReadStream, cid: string, size: number }> {
  const absoluteFilePath = `${__dirname}/${filePath}`;

  let readStream = fs.createReadStream(absoluteFilePath);
  const cid = await Cid.computeDagPbCidFromStream(readStream as any);

  let size = 0;
  readStream = fs.createReadStream(absoluteFilePath);
  readStream.on('data', chunk => {
    size += chunk['byteLength'];
  });

  return new Promise(resolve => {
    readStream.on('close', () => {
      return resolve({
        stream: fs.createReadStream(absoluteFilePath),
        cid,
        size
      });
    });
  });
}

type HttpResponse = {
  status: number,
  headers: http.IncomingHttpHeaders,
  body?: any
};

export function streamHttpRequest(url: string, opts: http.RequestOptions, bodyStream: ReadStream):
  Promise<HttpResponse> {

  return new Promise((resolve, reject) => {
    const request = http.request(url, opts, rawResponse => {
      rawResponse.setEncoding('utf8');

      const response: HttpResponse = {
        status  : rawResponse.statusCode,
        headers : rawResponse.headers
      };

      let body = '';
      rawResponse.on('data', chunk => {
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

export async function sendWsMessage(address: string, message: any): Promise<Buffer> {
  return new Promise((resolve) => {
    const socket = new WebSocket(address);

    socket.onopen = (_event) => {
      socket.onmessage = event => {
        socket.terminate();
        return resolve(<Buffer>event.data);
      };

      socket.send(message);
    };
  });
}