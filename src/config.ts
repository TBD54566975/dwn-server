import bytes from 'bytes';

export type DwnServerConfig = typeof config;

export const config = {
  /**
   * Used to populate the `server` property returned by the `/info` endpoint.
   *
   * If running using `npm` the `process.env.npm_package_name` variable exists and we use that,
   * otherwise we fall back on the use defined `DWN_SERVER_PACKAGE_NAME` or `@web5/dwn-server`.
   */
  serverName: process.env.npm_package_name || process.env.DWN_SERVER_PACKAGE_NAME || '@web5/dwn-server',
  /**
   * Used to populate the `version` and `sdkVersion` properties returned by the `/info` endpoint.
   *
   * The `version` and `sdkVersion` are pulled from `package.json` at runtime.
   * If running using `npm` the `process.env.npm_package_json` variable exists as the filepath, so we use that.
   * Otherwise we check to see if a specific `DWN_SERVER_PACKAGE_JSON` exists, if it does we use that.
   * Finally if both of those options don't exist we resort to the path within the docker server image, located at `/dwn-server/package.json`
   */
  packageJsonPath:  process.env.npm_package_json ||  process.env.DWN_SERVER_PACKAGE_JSON || '/dwn-server/package.json',
  // max size of data that can be provided with a RecordsWrite
  maxRecordDataSize: bytes(process.env.MAX_RECORD_DATA_SIZE || '1gb'),
  // port that server listens on
  port: parseInt(process.env.DS_PORT || '3000'),
  // whether to enable 'ws:'
  webSocketSupport: { on: true, off: false }[process.env.DS_WEBSOCKET_SERVER] ?? true,
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
