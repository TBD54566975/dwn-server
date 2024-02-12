import bytes from 'bytes';

export type DwnServerConfig = typeof config;

export const config = {
  // max size of data that can be provided with a RecordsWrite
  maxRecordDataSize: bytes(process.env.MAX_RECORD_DATA_SIZE || '1gb'),
  // port that server listens on
  port: parseInt(process.env.DS_PORT || '3000'),
  // whether to enable 'ws:'
  webSocketServerEnabled: { on: true, off: false }[process.env.DWN_WEBSOCKET_SERVER] ?? true,
  // where to store persistent data
  messageStore: process.env.DWN_STORAGE_MESSAGES || process.env.DWN_STORAGE || 'level://data',
  dataStore: process.env.DWN_STORAGE_DATA || process.env.DWN_STORAGE || 'level://data',
  eventLog: process.env.DWN_STORAGE_EVENTS || process.env.DWN_STORAGE || 'level://data',

  // tenant registration feature configuration
  registrationStoreUrl: process.env.DWN_REGISTRATION_STORE_URL || process.env.DWN_STORAGE,
  registrationProofOfWorkSeed: process.env.DWN_REGISTRATION_PROOF_OF_WORK_SEED,
  registrationProofOfWorkEnabled: process.env.DWN_REGISTRATION_PROOF_OF_WORK_ENABLED === 'true',
  registrationProofOfWorkInitialMaxHash: process.env.DWN_REGISTRATION_PROOF_OF_WORK_INITIAL_MAX_HASH,
  termsOfServiceFilePath: process.env.DWN_TERMS_OF_SERVICE_FILE_PATH,

  // log level - trace/debug/info/warn/error
  logLevel: process.env.DWN_SERVER_LOG_LEVEL || 'INFO',
};
