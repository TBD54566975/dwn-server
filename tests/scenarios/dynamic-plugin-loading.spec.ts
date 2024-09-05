import chaiAsPromised from 'chai-as-promised';
import chai, { expect } from 'chai';
import DataStoreSqlite from '../plugins/data-store-sqlite.js';
import EventLogSqlite from '../plugins/event-log-sqlite.js';
import EventStreamInMemory from '../plugins/event-stream-in-memory.js';
import sinon from 'sinon';

import { config } from '../../src/config.js';
import { DwnServer } from '../../src/dwn-server.js';

import { DidDht, DidKey, UniversalResolver } from '@web5/dids';
import CommonScenarioValidator from '../common-scenario-validator.js';
import MessageStoreSqlite from '../plugins/message-store-sqlite.js';
import ResumableTaskStoreSqlite from '../plugins/resumable-task-store-sqlite.js';

// node.js 18 and earlier needs globalThis.crypto polyfill
if (!globalThis.crypto) {
  // @ts-ignore
  globalThis.crypto = webcrypto;
}

chai.use(chaiAsPromised);

describe('Dynamic DWN plugin loading', function () {
  let dwnServer: DwnServer;

  afterEach(async () => {
    if (dwnServer !== undefined) {
      await dwnServer.stop();
    }
  });

  it('should fail dynamically loading a non-existent plugin', async () => {
    const dwnServerConfigCopy = { ...config }; // not touching the original config
    dwnServerConfigCopy.dataStore = './non-existent-plugin.js';

    const invalidDwnServer = new DwnServer({ config: dwnServerConfigCopy });
    await expect(invalidDwnServer.start()).to.be.rejectedWith('Failed to load component at ./non-existent-plugin.js');
  });

  it('should be able to dynamically load and use custom data store implementation', async () => {
    // Scenario:
    // 1. Configure DWN to load a custom data store plugin.
    // 2. Validate that the constructor of the plugin is called.
    // 3. Validate that the DWN instance is using the custom data store plugin.

    // NOTE: was not able to spy on constructor directly, so spying on a method that is called in the constructor
    const customMessageStoreConstructorSpy = sinon.spy(MessageStoreSqlite, 'spyingTheConstructor');
    const customDataStoreConstructorSpy = sinon.spy(DataStoreSqlite, 'spyingTheConstructor');
    const customResumableTaskStoreConstructorSpy = sinon.spy(ResumableTaskStoreSqlite, 'spyingTheConstructor');
    const customEventLogConstructorSpy = sinon.spy(EventLogSqlite, 'spyingTheConstructor');
    const customEventStreamConstructorSpy = sinon.spy(EventStreamInMemory, 'spyingTheConstructor');

    // 1. Configure DWN to load a custom data store plugin.
    const dwnServerConfigCopy = { ...config }; // not touching the original config

    // TODO: remove below after https://github.com/TBD54566975/dwn-server/issues/144 is resolved
    // The default config is not reliable because other tests modify it.
    dwnServerConfigCopy.registrationStoreUrl = undefined; // allow all traffic

    dwnServerConfigCopy.messageStore = '../tests/plugins/message-store-sqlite.js';
    dwnServerConfigCopy.dataStore = '../tests/plugins/data-store-sqlite.js';
    dwnServerConfigCopy.resumableTaskStore = '../tests/plugins/resumable-task-store-sqlite.js';
    dwnServerConfigCopy.eventLog = '../tests/plugins/event-log-sqlite.js';
    dwnServerConfigCopy.eventStreamPluginPath = '../tests/plugins/event-stream-in-memory.js';

    // 2. Validate that the constructor of the plugin is called.
    // CRITICAL: We need to create a custom DID resolver that does not use a LevelDB based cache (which is the default cache used in `DWN`)
    // otherwise we will receive a `Database is not open` coming from LevelDB.
    // This is likely due to the fact that LevelDB is the default cache used in `DWN`, and we have tests creating default DWN instances,
    // so here we have to create a DWN that does not use the same LevelDB cache to avoid hitting LevelDB locked issues.
    // Long term we should investigate and unify approach of DWN instantiation taken by tests to avoid this "workaround" entirely. 
    const didResolver = new UniversalResolver({
      didResolvers : [DidDht, DidKey],
    });
    dwnServer = new DwnServer({ config: dwnServerConfigCopy, didResolver });
    await dwnServer.start();
    expect(customMessageStoreConstructorSpy.calledOnce).to.be.true;
    expect(customDataStoreConstructorSpy.calledOnce).to.be.true;
    expect(customResumableTaskStoreConstructorSpy.calledOnce).to.be.true;
    expect(customEventLogConstructorSpy.calledOnce).to.be.true;
    expect(customEventStreamConstructorSpy.calledOnce).to.be.true;

    // 3. Validate that the DWN instance is using the custom data store plugin.
    await CommonScenarioValidator.sanityTestDwnReadWrite(dwnServerConfigCopy.baseUrl);
  });
});
