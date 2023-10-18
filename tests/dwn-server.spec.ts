import { expect } from 'chai';

import { config } from '../src/config.js';
import { DwnServer } from '../src/dwn-server.js';
import { clear, dwn } from './test-dwn.js';

describe('DwnServer', function () {
  let dwnServer: DwnServer;
  const options = {
    dwn: dwn,
    config: config,
  };
  before(function () {
    dwnServer = new DwnServer(options);
  });
  after(async function () {
    dwnServer.stop(() => console.log('server stop'));
    await clear();
  });
  it('should create an instance of DwnServer', function () {
    expect(dwnServer).to.be.an.instanceOf(DwnServer);
  });

  it('should start the server and listen on the specified port', async function () {
    await dwnServer.start();
    const response = await fetch('http://localhost:3000', {
      method: 'GET',
    });
    expect(response.status).to.equal(200);
  });
  it('should stop the server', async function () {
    dwnServer.stop(() => console.log('server Stop'));
    // Add an assertion to check that the server has been stopped
    expect(dwnServer.httpServer.listening).to.be.false;
  });
});
