import { expect } from 'chai';
import sinon from 'sinon';

import { config } from '../src/config.js';
import type { Dwn } from '@tbd54566975/dwn-sdk-js';
import { DwnServer } from '../src/dwn-server.js';
import { getTestDwn } from './test-dwn.js';
import { Poller } from './poller.js';

describe('Process Handlers', function () {
  let dwn: Dwn;
  let dwnServer: DwnServer;
  let processExitStub: sinon.SinonStub;

  beforeEach(async function () {
    const dwn = await getTestDwn();
    dwnServer = new DwnServer({ dwn, config: config });
    await dwnServer.start();
    processExitStub = sinon.stub(process, 'exit');
  });

  afterEach(async () => {
    await dwnServer.stop();
    processExitStub.restore();
  });

  it('should stop when SIGINT is emitted', async function () {
    process.emit('SIGINT');

    Poller.pollUntilSuccessOrTimeout(async () => {
      expect(dwnServer.httpServer.listening).to.be.false;
      expect(processExitStub.called).to.be.false; // Ensure process.exit is not called
    });
  });

  it('should stop when SIGTERM is emitted', async function () {
    process.emit('SIGTERM');

    Poller.pollUntilSuccessOrTimeout(async () => {
      expect(dwnServer.httpServer.listening).to.be.false;
      expect(processExitStub.called).to.be.false; // Ensure process.exit is not called
    });
  });

  it('should log an error for an uncaught exception', async () => {

    // IMPORTANT: this test is a bit tricky to write because
    // existing process `uncaughtException` listener/handler will result will trigger an error when we force an `uncaughtException` event
    // causing the test to fail. So we need to remove the existing listener and add them back after the test.
    // To be in full control of the test, we also create the DWN server (which adds it's own `uncaughtException` listener)
    // AFTER removing the existing listener.
    await dwnServer.stop();

    // storing then removing existing listeners and adding back at the very end of the test
    const existingUncaughtExceptionListeners = [...process.listeners('uncaughtException')];
    process.removeAllListeners('uncaughtException');

    dwnServer = new DwnServer({ dwn, config: config });
    await dwnServer.start();
    
    const consoleErrorStub = sinon.stub(console, 'error'); // Stub console.error
    const errorMessage = 'Test uncaught exception';
    const error = new Error(errorMessage);
    process.emit('uncaughtException', error);

    // Ensure console.error was called with the expected error message
    console.log('console.error call count', consoleErrorStub.callCount);
    expect(consoleErrorStub.calledOnce).to.be.true;

    // Restore the original console.error
    consoleErrorStub.restore();

    // add back original listeners
    existingUncaughtExceptionListeners.forEach(listener => process.on('uncaughtException', listener));
  });
});
