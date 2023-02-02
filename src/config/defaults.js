import os from 'node:os';
import path from 'path';

import { fileURLToPath } from 'url';

// __filename and __dirname are not defined in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// path to root of this project (aka where package.json is)
const projectRoot = path.resolve(__dirname, '../../');

// path to default directory that contains all config files
const etcPath = `${projectRoot}/etc`;

export default {
  config: {
    // path that user-config is loaded from
    path: `${etcPath}/config.js` || process.env.AGGREGATOR_CONFIG_PATH
  },
  did: {
    // path to file where associated keys are stored
    storagePath : `${etcPath}/did.json`,
    // type of DID to create if one doesn't already exist
    method      : 'ion'
  },
  aggregator: {
    // path to default directory that contains all config files
    etcPath      : etcPath,
    // number of processes to spawn. Each process is capable of handling requests 
    numProcesses : os.cpus().length,
    // absolute path to root of this project
    rootPath     : projectRoot,

    // port to listen on
    port: 3000
  }
};