import { expect } from 'chai';
import * as http from 'http';
import { default as httpProxy } from 'http-proxy';
import { default as karma } from 'karma';
import type { AddressInfo } from 'net';
import { executablePath } from 'puppeteer';

import { config as defaultConfig } from '../src/config.js';
import { DwnServer } from '../src/dwn-server.js';
import { clear as clearDwn, dwn } from './test-dwn.js';

let noBrowser;
try {
  process.env.CHROME_BIN = executablePath();
} catch (e) {
  noBrowser = e;
}

class CorsProxySetup {
  server = null;
  proxy = null;
  dwnServer = null;
  karmaPort = 9876;
  proxyPort = 9875;

  public async start(): Promise<void> {
    const dwnServer = new DwnServer({
      dwn: dwn,
      config: {
        ...defaultConfig,
        port: 0, // UNSPEC to obtain test specific free port
      },
    });
    const dwnPort = await new Promise((resolve) => {
      dwnServer.start(() => {
        const port = (dwnServer.httpServer.address() as AddressInfo).port;
        resolve(port);
      });
    });
    // setup proxy server
    const proxy = httpProxy.createProxyServer({});
    const server = http.createServer((req, res) => {
      const [host] = req.headers.host.split(':', 2);
      if (host == 'dwn.localhost') {
        proxy.web(req, res, { target: `http://127.0.0.1:${dwnPort}` });
      } else if (host == 'app.localhost') {
        proxy.web(req, res, { target: `http://127.0.0.1:${this.karmaPort}` });
      } else {
        res.write('unexpected');
      }
    });
    await new Promise((done) => {
      server.listen(0, () => {
        this.proxyPort = (server.address() as AddressInfo).port;
        done(null);
      });
    });

    this.dwnServer = dwnServer;
    this.proxy = proxy;
    this.server = server;
  }
  public async stop(): Promise<void> {
    const server = this.server;
    const dwnServer = this.dwnServer;
    const proxy = this.proxy;

    // shutdown proxy server
    proxy.close();
    await new Promise((resolve) => {
      server.close(() => {
        server.closeAllConnections();
        resolve(null);
      });
    });
    // shutdown dwn
    await new Promise((resolve) => {
      dwnServer.stop(resolve);
    });
    await clearDwn();
  }
}

async function karmaRun(proxy, specfile): Promise<void> {
  const runResults: any = {};
  const browserErrors = [];
  const specResults = [];
  await new Promise((karmaRunDone) => {
    function karmaResultCapture(config): void {
      proxy.karmaPort = config.port; // karma port may change on startup
      this.onRunComplete = (browsers, results): void => {
        Object.assign(runResults, results);
      };
      this.onSpecComplete = (browser, result): void => {
        specResults.push(result);
      };
      this.onBrowserError = (browser, error): void => {
        browserErrors.push(error);
      };
      this.onBrowserLog = (browser, log): void => {
        console.log(log);
      };
    }
    karmaResultCapture.$inject = ['config'];

    const conf = karma.config.parseConfig(
      null,
      {
        logLevel: karma.constants.LOG_WARN,
        singleRun: true,
        autoWatch: false,
        files: [specfile],
        preprocessors: { [specfile]: ['esbuild'] },
        plugins: [
          'karma-mocha',
          'karma-esbuild',
          'karma-chrome-launcher',
          { 'reporter:capture': ['type', karmaResultCapture] },
        ],
        frameworks: ['mocha'],
        customLaunchers: {
          ChromeHeadless_with_proxy: {
            base: 'ChromeHeadless',
            flags: [
              `--proxy-server=http=127.0.0.1:${proxy.proxyPort}`,
              '--proxy-bypass-list=<-loopback>',
            ],
          },
        },
        browsers: ['ChromeHeadless_with_proxy'],
        reporters: ['capture'],
        upstreamProxy: {
          hostname: 'app.localhost',
        },
        esbuild: {
          target: 'chrome80',
          define: {
            global: 'window',
          },
          alias: {
            crypto: 'crypto-browserify',
            stream: 'stream-browserify',
          },
        },
      },
      { throwErrors: true },
    );

    const kserver = new karma.Server(conf, () => {
      // avoid process.exit call
      // Use mocha --exit flag because
      // esbuild service process still runs in background
      karmaRunDone(null);
    });
    kserver.start();
  });
  for (const error of browserErrors) {
    throw error;
  }
  for (const result of specResults) {
    if (!result.success) {
      throw new Error(result.log.join(''));
    }
  }
  expect(runResults.error).to.be.false;
  expect(runResults.failed).to.be.equal(0);
  expect(runResults.success).to.be.above(0);
}

describe('CORS setup', function () {
  // create proxy server to create cross-origin hostnames.
  // mocha test app runs on app.localhost
  // dwn-server runs on dwn.localhost
  const proxy = new CorsProxySetup();
  before(async () => {
    await proxy.start();
  });
  after(async () => {
    await proxy.stop();
  });
  this.timeout(5000);
  it('should run blank browser karma test', async function () {
    if (noBrowser) {
      this.skip();
    } else {
      await karmaRun(proxy, 'dist/esm/tests/cors/ping.browser.js');
    }
  });
  it('should run http-api browser karma test', async function () {
    if (noBrowser) {
      this.skip();
    } else {
      await karmaRun(proxy, 'dist/esm/tests/cors/http-api.browser.js');
    }
  });
});
