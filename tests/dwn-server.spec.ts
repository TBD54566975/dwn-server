import { expect } from 'chai';

import type { DwnServerConfig } from '../src/config.js';
import { config } from '../src/config.js';
import { DwnServer } from '../src/dwn-server.js';
import { randomBytes } from 'crypto';

describe('DwnServer', function () {
  const dwnServerConfig = { ...config };
  
  before(async function () {
    // NOTE: using SQL to workaround an issue where multiple instances of DwnServer can be started using LevelDB in the same test run,
    // and dwn-server.spec.ts already uses LevelDB.
    dwnServerConfig.messageStore = 'sqlite://';
    dwnServerConfig.dataStore = 'sqlite://';
    dwnServerConfig.eventLog = 'sqlite://';
  });

  after(async function () {
  });

  it('should initialize ProofOfWorkManager with challenge nonce seed if given.', async function () {
    const registrationProofOfWorkSeed = randomBytes(32).toString('hex');
    const configWithProofOfWorkSeed: DwnServerConfig = {
      ...dwnServerConfig,
      registrationStoreUrl: 'sqlite://',
      registrationProofOfWorkEnabled: true,
      registrationProofOfWorkSeed
    };

    const dwnServer = new DwnServer({ config: configWithProofOfWorkSeed });
    await dwnServer.start();
    expect(dwnServer.registrationManager['proofOfWorkManager']['challengeSeed']).to.equal(registrationProofOfWorkSeed);

    dwnServer.stop(() => console.log('server Stop'));
    expect(dwnServer.httpServer.listening).to.be.false;
  });
});
