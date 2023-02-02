import fs from 'node:fs';

import mkdirp from 'mkdirp';
import merge from 'lodash/merge.js';

import defaults from './defaults.js';

// ensure that directory for all config and config-adjacent files exists
mkdirp.sync(defaults.aggregator.etcPath);

const configExists = fs.existsSync(defaults.config.path);
let { default: config = {} } = configExists && await import(defaults.config.path);

// deep-merge defaults and config
const mergedConfig = merge({}, defaults, config);

// TODO: consider providing env var overrides

export { mergedConfig as config };