import {
  Dwn,
  DataStoreLevel,
  EventLogLevel,
  MessageStoreLevel,
} from '@tbd54566975/dwn-sdk-js';

const testDwnDataDirectory = 'data-test';

const dataStore = new DataStoreLevel({
  blockstoreLocation: `${testDwnDataDirectory}/DATASTORE`,
});
const eventLog = new EventLogLevel({
  location: `${testDwnDataDirectory}/EVENTLOG`,
});
const messageStore = new MessageStoreLevel({
  blockstoreLocation: `${testDwnDataDirectory}/MESSAGESTORE`,
  indexLocation: `${testDwnDataDirectory}/INDEX`,
});

export const dwn = await Dwn.create({ eventLog, dataStore, messageStore });

export async function clear(): Promise<void> {
  await dataStore.clear();
  await eventLog.clear();
  await messageStore.clear();
}
