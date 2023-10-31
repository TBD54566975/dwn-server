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

  // require POW-based registration for new tenants
  registrationRequirementPow: process.env.DWN_REGISTRATION_POW == 'true',
  tenantRegistrationStore:
    process.env.DWN_STORAGE_REGISTRATION ||
    process.env.DWN_STORAGE ||
    'sqlite://data/dwn.db',

  registrationRequirementTos: process.env.DWN_REGISTRATION_TOS,

  // log level - trace/debug/info/warn/error
  logLevel: process.env.DWN_SERVER_LOG_LEVEL || 'INFO',
};
