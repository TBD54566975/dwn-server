import { DwnAggregatorClient } from '../src/client/index.js';
import { DIDIon } from '../src/did/did-ion.js';
import { RecordsWrite } from '@tbd54566975/dwn-sdk-js';
import { randomBytes, randomInt } from '../tmp/utils.js';

const client = await DwnAggregatorClient.create(['ws://localhost:3000']);

const didState = await DIDIon.generate();
const didAuthnPrivateJwk = didState.keys['key-1'].privateJwk;
const { alg, kid } = didAuthnPrivateJwk;
const fullKid = `${didState.did}#${kid}`;

const signatureMaterial = { privateJwk: didAuthnPrivateJwk, protectedHeader: { alg, kid: fullKid } };

const subscriptionReciept = await client.subscribe({ protocol: 'yeeter' }, (message) => {
  console.log('ooo mai gad. yeeter', message);
});

console.log('subscribed?', subscriptionReciept);

const yeet = await RecordsWrite.create({
  data           : randomBytes(randomInt(50, 500)),
  dataFormat     : 'application/json',
  published      : true,
  protocol       : 'yeeter',
  schema         : 'yeeter/post',
  signatureInput : signatureMaterial
});

const result = await client.sendDWebMessage(yeet.toJSON());
console.log(result);

setTimeout(async () => {
  const yeet = await RecordsWrite.create({
    data           : randomBytes(randomInt(50, 500)),
    dataFormat     : 'application/json',
    published      : true,
    protocol       : 'yeeter',
    schema         : 'yeeter/post',
    signatureInput : signatureMaterial
  });

  const result = await client.sendDWebMessage(yeet.toJSON());
  console.log(result);
}, 5000);
