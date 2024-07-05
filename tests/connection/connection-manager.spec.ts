import type { Dwn } from '@tbd54566975/dwn-sdk-js';

import chaiAsPromised from 'chai-as-promised';
import chai, { expect } from 'chai';

import sinon from 'sinon';
import { getTestDwn } from '../test-dwn.js';
import { InMemoryConnectionManager } from '../../src/connection/connection-manager.js';
import { config } from '../../src/config.js';
import { WsApi } from '../../src/ws-api.js';
import { HttpApi } from '../../src/http-api.js';
import { JsonRpcSocket } from '../../src/json-rpc-socket.js';

chai.use(chaiAsPromised);

describe('InMemoryConnectionManager', () => {
  let dwn: Dwn;
  let connectionManager: InMemoryConnectionManager;
  let httpApi: HttpApi;  
  let wsApi: WsApi;

  beforeEach(async () => {
    dwn = await getTestDwn({ withEvents: true });
    connectionManager = new InMemoryConnectionManager(dwn);
    httpApi = await HttpApi.create(config, dwn);
    await httpApi.start(9002);
    wsApi = new WsApi(httpApi.server, dwn, connectionManager);
    wsApi.start();
  });

  afterEach(async () => {
    await connectionManager.closeAll();
    await dwn.close();
    await httpApi.stop();
    await wsApi.close();
    sinon.restore();
  });

  it('adds connection to the connections and removes it if that connection is closed', async () => {
    const connection = await JsonRpcSocket.connect('ws://127.0.0.1:9002');
    expect((connectionManager as any).connections.size).to.equal(1);
    connection.close();

    await new Promise((resolve) => setTimeout(resolve, 5)); // wait for close event to be fired
    expect((connectionManager as any).connections.size).to.equal(0);
  });

  it('closes all connections on `closeAll`', async () => {

    await JsonRpcSocket.connect('ws://127.0.0.1:9002');
    expect((connectionManager as any).connections.size).to.equal(1);

    await JsonRpcSocket.connect('ws://127.0.0.1:9002');
    expect((connectionManager as any).connections.size).to.equal(2);

    await connectionManager.closeAll();
    expect((connectionManager as any).connections.size).to.equal(0);
  })
});