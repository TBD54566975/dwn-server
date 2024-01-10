import { expect } from 'chai';
import sinon from 'sinon';

import { config } from '../src/config.js';
import { DwnServer } from '../src/dwn-server.js';
import { getTestDwn } from './test-dwn.js';

describe('Process Handlers', function () {
  let dwnServer: DwnServer;
  let processExitStub: sinon.SinonStub;

  beforeEach(async function () {
    const testDwn = await getTestDwn();
    dwnServer = new DwnServer({ dwn: testDwn, config: config });
    await dwnServer.start();
    processExitStub = sinon.stub(process, 'exit');
  });
  afterEach(async function () {
    dwnServer.stop(() => console.log('server stop in Process Handlers tests'));

    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('uncaughtException');
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
