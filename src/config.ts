import bytes from 'bytes';

export const config = {
  // max size of data that can be provided with a RecordsWrite
  maxRecordDataSize : bytes(process.env.MAX_RECORD_DATA_SIZE || '1gb'),
  // port that server listens on
  port              : parseInt(process.env.DS_PORT || '3000'),

  // TODO: add config option to enable/disable websocket server. default: enabled
  // TODO: add config option to change data path. will need to change dwn.ts to ensure that the option works
  //       inside and outside a docker container.
};