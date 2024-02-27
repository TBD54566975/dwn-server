import type { Dwn } from '@tbd54566975/dwn-sdk-js';

import chaiAsPromised from 'chai-as-promised';
import chai, { expect } from 'chai';

import sinon from 'sinon';
import { WebSocket } from 'ws';
import { SocketConnection } from '../../src/connection/socket-connection.js';
import { getTestDwn } from '../test-dwn.js';
import log from 'loglevel';

chai.use(chaiAsPromised);

describe('SocketConnection', () => {
  let dwn: Dwn;

  before(async () => {
    dwn = await getTestDwn();
  });

  after(async () => {
    await dwn.close();
    sinon.restore();
  });

  it('should assign socket handlers', async () => {
    const socket = sinon.createStubInstance(WebSocket);
    const connection = new SocketConnection(socket, dwn);
    expect(socket.on.callCount).to.equal(4);
    expect(socket.on.args.map(arg => arg[0])).to.have.members(['message', 'close', 'error', 'pong']);
    await connection.close();
  });

  it('should add a subscription to the subscription manager map', async () => {
    const socket = sinon.createStubInstance(WebSocket);
    const connection = new SocketConnection(socket, dwn);
    const subscriptionRequest = {
      id: 'id',
      method: 'method',
      params: { param1: 'param' },
      close: async ():Promise<void> => {}
    }

    await connection.addSubscription(subscriptionRequest);
    expect((connection as any).subscriptions.size).to.equal(1);
    await connection.close(); 
    expect((connection as any).subscriptions.size).to.equal(0);
  });

  it('should reject a subscription with an Id of an existing subscription', async () => {
    const socket = sinon.createStubInstance(WebSocket);
    const connection = new SocketConnection(socket, dwn);

    const id = 'some-id';

    const subscriptionRequest = {
      id,
      method: 'method',
      params: { param1: 'param' },
      close: async ():Promise<void> => {}
    }

    await connection.addSubscription(subscriptionRequest);
    expect((connection as any).subscriptions.size).to.equal(1);

    const addDuplicatePromise = connection.addSubscription(subscriptionRequest);
    await expect(addDuplicatePromise).to.eventually.be.rejectedWith(`the subscription with id ${id} already exists`);
    expect((connection as any).subscriptions.size).to.equal(1);
    await connection.close(); 
    expect((connection as any).subscriptions.size).to.equal(0);
  });

  it('should close a subscription and remove it from the connection manager map', async () => {
    const socket = sinon.createStubInstance(WebSocket);
    const connection = new SocketConnection(socket, dwn);

    const id = 'some-id';

    const subscriptionRequest = {
      id,
      method: 'method',
      params: { param1: 'param' },
      close: async ():Promise<void> => {}
    }

    await connection.addSubscription(subscriptionRequest);
    expect((connection as any).subscriptions.size).to.equal(1);

    await connection.closeSubscription(id);
    expect((connection as any).subscriptions.size).to.equal(0);

    const closeAgainPromise = connection.closeSubscription(id);
    await expect(closeAgainPromise).to.eventually.be.rejectedWith(`the subscription with id ${id} was not found`);
    await connection.close(); 
  });

  it('hasSubscription returns whether a subscription with the id already exists', async () => {
    const socket = sinon.createStubInstance(WebSocket);
    const connection = new SocketConnection(socket, dwn);
    const subscriptionRequest = {
      id: 'id',
      method: 'method',
      params: { param1: 'param' },
      close: async ():Promise<void> => {}
    }

    await connection.addSubscription(subscriptionRequest);
    expect((connection as any).subscriptions.size).to.equal(1);
    expect(connection.hasSubscription(subscriptionRequest.id)).to.be.true;
    expect(connection.hasSubscription('does-not-exist')).to.be.false;

    await connection.closeSubscription(subscriptionRequest.id);
    expect(connection.hasSubscription(subscriptionRequest.id)).to.be.false;
    await connection.close();
  });

  it('should close if pong is not triggered between heartbeat intervals', async () => {
    const socket = sinon.createStubInstance(WebSocket);
    const clock = sinon.useFakeTimers();
    const connection = new SocketConnection(socket, dwn);
    const closeSpy = sinon.spy(connection, 'close');

    clock.tick(60_100); // interval has to run twice
    clock.restore();

    expect(closeSpy.callCount).to.equal(1);
  });

  it('should not close if pong is called within the heartbeat interval', async () => {
    const socket = sinon.createStubInstance(WebSocket);
    const clock = sinon.useFakeTimers();
    const connection = new SocketConnection(socket, dwn);
    const closeSpy = sinon.spy(connection, 'close');

    (connection as any).pong(); // trigger a pong
    clock.tick(30_100); // first interval 

    (connection as any).pong(); // trigger a pong
    clock.tick(30_100); // second interval

    expect(closeSpy.callCount).to.equal(0);

    clock.tick(30_100); // another interval without a ping
    clock.restore();
    expect(closeSpy.callCount).to.equal(1);
  });

  it('logs an error and closes connection if error is triggered', async () => {
    const socket = sinon.createStubInstance(WebSocket);
    const connection = new SocketConnection(socket, dwn);
    const logSpy = sinon.stub(log, 'error');
    const closeSpy = sinon.spy(connection, 'close');

    (connection as any).error(new Error('some error'));

    expect(logSpy.callCount).to.equal(1);
    expect(closeSpy.callCount).to.equal(1);
  });
});