import { createRequire } from 'node:module';
import { Dwn, ProtocolsConfigure, ProtocolsQuery } from '@tbd54566975/dwn-sdk-js';
import { didState } from './did/did-loader.js';

const require = createRequire(import.meta.url);
const yeeterProtocol = require('../resources/yeeter-protocol.json');
const protocols = [yeeterProtocol];

const { privateJwk } = didState.keys['key-1'];

const aggregatorSignatureMaterial = {
  privateJwk,
  protectedHeader: { alg: privateJwk.alg, kid: `${didState.did}#${privateJwk.kid}` }
};

export const dwn = await Dwn.create({});

export async function initializeProtocols() {
  for (let { protocol, definition } of protocols) {
    const query = await ProtocolsQuery.create({
      filter: {
        protocol
      },
      authorizationSignatureInput: aggregatorSignatureMaterial
    });

    let result = await dwn.processMessage(didState.did, query.toJSON());

    if (result.status.code !== 200) {
      throw new Error(`failed to initialize protocols. error: ${JSON.stringify(result, null, 2)}`);
    }

    const [ existingProtocol ] = result.entries;

    if (existingProtocol) {
      continue;
    }

    const createProtocolMessage = await ProtocolsConfigure.create({
      protocol,
      definition,
      authorizationSignatureInput: aggregatorSignatureMaterial
    });

    result = await dwn.processMessage(didState.did, createProtocolMessage.toJSON());

    if (result.status.code !== 202) {
      throw new Error('failed to initialize protocols');
    }
  }
}