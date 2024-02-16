import { expect } from 'chai';

import { config } from '../src/config.js';
import { DwnServer } from '../src/dwn-server.js';
import { getTestDwn } from './test-dwn.js';

describe('DwnServer', function () {
  const dwnServerConfig = { ...config };
  

  it('starts with injected dwn', async function () {
    const testDwn = await getTestDwn();

    const dwnServer = new DwnServer({ config: dwnServerConfig, dwn: testDwn });
    await dwnServer.start();

    dwnServer.stop(() => console.log('server Stop'));
    expect(dwnServer.httpServer.listening).to.be.false;
  });
});
