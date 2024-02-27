import type { Dwn } from '@tbd54566975/dwn-sdk-js';

import { expect } from 'chai';

import { config } from '../src/config.js';
import { DwnServer } from '../src/dwn-server.js';
import { getTestDwn } from './test-dwn.js';

describe('DwnServer', function () {
  const dwnServerConfig = { ...config };
  let dwn: Dwn;
  
  it('starts with injected dwn', async function () {
    dwn = await getTestDwn();

    const dwnServer = new DwnServer({ config: dwnServerConfig, dwn });
    await dwnServer.start();

    dwnServer.stop(() => console.log('server Stop'));
    expect(dwnServer.httpServer.listening).to.be.false;
  });

  describe('webSocketServerEnabled config', function() {
    it('should not return a websocket server if disabled', async function() {
      dwn = await getTestDwn({ withEvents: true });
      const withoutSocketServer = new DwnServer({
        dwn,
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
      dwn = await getTestDwn({ withEvents: true });
      const withSocketServer = new DwnServer({
        dwn,
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
