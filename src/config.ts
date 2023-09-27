import bytes from 'bytes';

export type Config = typeof config;

export const config = {
  // max size of data that can be provided with a RecordsWrite
  maxRecordDataSize: bytes(process.env.MAX_RECORD_DATA_SIZE || '1gb'),
  // port that server listens on
  port: parseInt(process.env.DS_PORT || '3000'),
  // whether to enable 'ws:'
  webSocketServerEnabled:
    { on: true, off: false }[process.env.DS_WEBSOCKET_SERVER] ?? true,
  // where to store persistant data
  messageStore:
    process.env.DWN_STORAGE_MESSAGES ||
    process.env.DWN_STORAGE ||
    'level://data',
  dataStore:
    process.env.DWN_STORAGE_DATA || process.env.DWN_STORAGE || 'level://data',
  eventLog:
    process.env.DWN_STORAGE_EVENTS || process.env.DWN_STORAGE || 'level://data',

  // log level - trace/debug/info/warn/error
  logLevel: process.env.DWN_SERVER_LOG_LEVEL || 'INFO',

  subscriptionsEnabled:
    { on: true, off: false }[process.env.SUBSCRIPTIONS] ?? true,
  // where to store persistant data
};
