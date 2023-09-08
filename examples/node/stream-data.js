import fetch from 'node-fetch';

import { RecordsRead } from '@tbd54566975/dwn-sdk-js';
import { v4 as uuidv4 } from 'uuid';

import { createJsonRpcRequest } from '../../dist/src/lib/json-rpc.js';
import {
  createProfile,
  createRecordsWriteMessage,
  getFileAsReadStream,
} from '../../dist/tests/utils.js';

const alice = await createProfile();
const { stream, size, cid } = await getFileAsReadStream('fixtures/test.jpeg');
const { recordsWrite } = await createRecordsWriteMessage(alice, {
  dataCid: cid,
  dataSize: size,
});

let rpcRequest = await createJsonRpcRequest(uuidv4(), 'dwn.processMessage', {
  target: alice.did,
  message: recordsWrite.toJSON(),
});

let resp = await fetch('http://localhost:3000', {
  method: 'POST',
  headers: {
    'dwn-request': JSON.stringify(rpcRequest),
    'content-type': 'application/octet-stream',
  },
  body: stream,
});

console.log(resp.status);

const recordsRead = await RecordsRead.create({
  authorizationSignatureInput: alice.signatureInput,
  recordId: recordsWrite.message.recordId,
});

rpcRequest = await createJsonRpcRequest(uuidv4(), 'dwn.processMessage', {
  target: alice.did,
  message: recordsRead.toJSON(),
});

resp = await fetch('http://localhost:3000', {
  method: 'POST',
  headers: {
    'dwn-request': JSON.stringify(rpcRequest),
  },
});

resp.body.on('data', (chunk) => {
  console.log(chunk);
});
