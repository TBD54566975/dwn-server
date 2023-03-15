import { DwnAggregatorClient } from '../src/client/index.js';
import { DIDIon } from '../src/did/did-ion.js';
import { RecordsWrite } from '@tbd54566975/dwn-sdk-js';

const randomBytes = (length) => {
  return Buffer.from(Array.from({ length }, () => Math.floor(Math.random() * 256)));
};

(async () => {
  const client = await DwnAggregatorClient.create(['ws://localhost:3000']);

  const didState = await DIDIon.generate();
  const didAuthnPrivateJwk = didState.keys['key-1'].privateJwk;
  const { alg, kid } = didAuthnPrivateJwk;
  const fullKid = `${didState.did}#${kid}`;

  const signatureMaterial = {
    privateJwk      : didAuthnPrivateJwk,
    protectedHeader : { alg, kid: fullKid },
  };

  const data = randomBytes(100); // Adjust the length of the data as needed

  const yeet = await RecordsWrite.create({
    data,
    dataFormat                  : 'application/json',
    published                   : true,
    protocol                    : 'yeeter',
    schema                      : 'yeeter/post',
    authorizationSignatureInput : signatureMaterial,
  });

  const result = await client.sendDWebMessage(yeet.toJSON(), { data });
  console.log(result);

})();
