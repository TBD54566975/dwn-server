import { Dwn, DataStoreLevel, EventLogLevel, MessageStoreLevel } from '@tbd54566975/dwn-sdk-js';

export const dataStore = new DataStoreLevel({ blockstoreLocation: 'data/DATASTORE' });
export const eventLog = new EventLogLevel({ location: 'data/EVENTLOG' });
export const messageStore = new MessageStoreLevel({
  blockstoreLocation : 'data/MESSAGESTORE',
  indexLocation      : 'data/INDEX'
});

export const dwn = await Dwn.create({ eventLog, dataStore, messageStore });