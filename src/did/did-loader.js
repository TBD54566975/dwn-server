import fs from 'node:fs';

import { config } from '../config/index.js';
import { DIDIon } from './did-ion.js';

let didState;

if (fs.existsSync(config.did.storagePath)) {
  const didStateJson = fs.readFileSync(config.did.storagePath, { encoding: 'utf-8' });
  didState = JSON.parse(didStateJson);
} else {
  if (config.did.method === 'ion') {
    didState = await DIDIon.generate();
    fs.writeFileSync(config.did.storagePath, JSON.stringify(didState, null, 2));
  } else {
    throw new Error(`DID Method ${config.did.method} not supported`);
  }
}

export { didState };