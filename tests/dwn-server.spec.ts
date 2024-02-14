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

  describe('webSocketServerEnabled config', function() {
    it('should not return a websocket server if disabled', async function() {
      const withoutSocketServer = new DwnServer({
        config: {
          ...dwnServerConfig,
          webSocketServerEnabled: false,
        }
      });

      await withoutSocketServer.start();
      expect(withoutSocketServer.httpServer.listening).to.be.true;
      expect(withoutSocketServer.wsServer).to.be.undefined;
      withoutSocketServer.stop(() => console.log('server Stop'));
      expect(withoutSocketServer.httpServer.listening).to.be.false;
    });

    it('should return a websocket server if enabled', async function() {
      const withSocketServer = new DwnServer({
        config: {
          ...dwnServerConfig,
          webSocketServerEnabled: true,
        }
      });

      await withSocketServer.start();
      expect(withSocketServer.wsServer).to.not.be.undefined;
      withSocketServer.stop(() => console.log('server Stop'));
      expect(withSocketServer.httpServer.listening).to.be.false;
    });
  });
});
