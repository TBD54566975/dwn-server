import { expect } from 'chai';
import sinon from 'sinon';

import { config } from '../src/config.js';
import { DwnServer } from '../src/dwn-server.js';
import { clear, dwn } from './test-dwn.js';

describe('Process Handlers', function () {
  let dwnServer: DwnServer;
  const options = {
    dwn: dwn,
    config: config,
  };
  let processExitStub: sinon.SinonStub;

  before(async function () {
    dwnServer = new DwnServer(options);
  });
  beforeEach(async function () {
    await dwnServer.start();
    processExitStub = sinon.stub(process, 'exit');
  });
  afterEach(async function () {
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('uncaughtException');
    await clear();
    processExitStub.restore();
  });
  it('should stop when SIGINT is emitted', async function () {
    process.emit('SIGINT');
    expect(dwnServer.httpServer.listening).to.be.false;
    expect(processExitStub.called).to.be.false; // Ensure process.exit is not called
  });

  it('should stop when SIGTERM is emitted', async function () {
    process.emit('SIGTERM');
    expect(dwnServer.httpServer.listening).to.be.false;
    expect(processExitStub.called).to.be.false; // Ensure process.exit is not called
  });

  it('should log an error for an uncaught exception', function () {
    const consoleErrorStub = sinon.stub(console, 'error'); // Stub console.error
    const errorMessage = 'Test uncaught exception';
    const error = new Error(errorMessage);
    process.emit('uncaughtException', error);
    // Ensure console.error was called with the expected error message
    expect(consoleErrorStub.calledOnce).to.be.true;

    // Restore the original console.error
    consoleErrorStub.restore();
  });
});
