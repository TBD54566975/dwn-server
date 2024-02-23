import type { Dwn } from '@tbd54566975/dwn-sdk-js';

import chaiAsPromised from 'chai-as-promised';
import chai, { expect } from 'chai';

import sinon from 'sinon';
import { WebSocket } from 'ws';
import { getTestDwn } from '../test-dwn.js';
import { InMemoryConnectionManager } from '../../src/connection/connection-manager.js';

chai.use(chaiAsPromised);

describe('InMemoryConnectionManager', () => {
  let dwn: Dwn;
  let connectionManager: InMemoryConnectionManager; 

  beforeEach(async () => {
    dwn = await getTestDwn({ withEvents: true });
    connectionManager = new InMemoryConnectionManager(dwn);
  });

  afterEach(async () => {
    await connectionManager.closeAll();
    await dwn.close();
    sinon.restore();
  });

  it('adds connection to the connections map and closes all', async () => {
    const socket1 = sinon.createStubInstance(WebSocket);
    await connectionManager.connect(socket1);
    expect((connectionManager as any).connections.size).to.equal(1);

    const socket2 = sinon.createStubInstance(WebSocket);
    await connectionManager.connect(socket2);
    expect((connectionManager as any).connections.size).to.equal(2);
  });

  xit('closes all connections', async () => {
    const socket = sinon.createStubInstance(WebSocket);
    await connectionManager.connect(socket);
    expect((connectionManager as any).connections.size).to.equal(1);
    await connectionManager.closeAll();
    expect((connectionManager as any).connections.size).to.equal(0);
  });
});