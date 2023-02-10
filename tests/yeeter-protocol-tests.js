import { createRequire } from 'node:module';
import { ProtocolsConfigure } from '@tbd54566975/dwn-sdk-js';
import { DIDIon } from '../src/did/did-ion.js';
import { expect } from 'chai';

const require = createRequire(import.meta.url);
const yeeterProtocol = require('../resources/yeeter-protocol.json');


describe('Yeeter Protocol', function() {
  it('is a valid protocol definition', async function() {
    const didState = await DIDIon.generate();
    const { privateJwk } = didState.keys['key-1'];

    const signatureMaterial = {
      privateJwk,
      protectedHeader: { alg: privateJwk.alg, kid: `${didState.did}#${privateJwk.kid}` }
    };

    const { protocol, definition } = yeeterProtocol;
    try {
      await ProtocolsConfigure.create({
        protocol                    : protocol,
        definition                  : definition,
        authorizationSignatureInput : signatureMaterial
      });
    } catch(e) {
      expect.fail(e);
    }
  });
});