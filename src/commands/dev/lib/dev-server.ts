import http from 'http';
import chalk from 'chalk';
import httpProxy from 'http-proxy';
import serveHandler from 'serve-handler';
// @ts-ignore
import { createFunction } from '../../../../../lambdas/lambda-dev/dist/src';

import error from '../../../util/output/error';
import success from '../../../util/output/success';
import { readLocalConfig } from '../../../util/config/files';

import devRouter from './dev-router';
import { buildUserProject, createIgnoreList } from './dev-builder';

import {
  DevServerStatus,
  DevServerOptions,
  BuilderOutput,
  BuilderOutputs,
  HttpHandler
} from './types';

export default class DevServer {
  public cwd: string;

  private debug: boolean;
  private server: http.Server;
  private status: DevServerStatus;
  private statusMessage = '';

  constructor(cwd: string, options: DevServerOptions) {
    this.cwd = cwd;
    this.debug = options.debug;
    this.server = http.createServer(this.devServerHandler);
    this.status = DevServerStatus.busy;
  }

  /* use dev-server as a "console" for logs. */

  logDebug = (...args: any[]) => {
    if (this.debug) {
      console.log(chalk.yellowBright('> [debug]'), ...args);
    }
  };

  logError(str: string) {
    console.log(error(str));
  }

  logSuccess(str: string) {
    console.log(success(str));
  }

  logHttp(msg = '') {
    console.log(`  ${chalk.green('>>>')} ${msg}`);
  }

  /* set dev-server status */

  setStatusIdle = () => {
    this.status = DevServerStatus.idle;
    this.statusMessage = '';
  };

  setStatusBusy = (msg = '') => {
    this.status = DevServerStatus.busy;
    this.statusMessage = msg;
  };

  setStatusError = (msg: string) => {
    this.status = DevServerStatus.error;
    this.statusMessage = msg;
  };

  /**
   * Launch dev-server
   */
  start = async (port = 3000) => {
    const nowJson = readLocalConfig(this.cwd);

    return new Promise((resolve, reject) => {
      this.server.on('error', reject);

      this.server.listen(port, async () => {
        this.logSuccess(
          `dev server listning on port ${chalk.bold(String(port))}`
        );

        // Initial build. Not meant to invoke, but for speed up further builds.
        if (nowJson && nowJson.builds) {
          this.logDebug(`Initial build`);
          await buildUserProject(nowJson.builds, this);
        }

        this.logSuccess('Initial build ready');
        this.setStatusIdle();
        resolve();
      });
    });
  };

  /**
   * dev-server http handler
   */
  devServerHandler: HttpHandler = async (req, res) => {
    if (this.status === DevServerStatus.busy) {
      return res.end(`[busy] ${this.statusMessage}...`);
    }

    if (req.url === '/favicon.ico') {
      return serveStaticFile(req, res, this.cwd);
    }

    this.logHttp(req.url);

    try {
      const nowJson = readLocalConfig(this.cwd);

      if (nowJson === null) {
        await this.serveProjectAsStatics(req, res, this.cwd);
      } else if (nowJson.version === 2) {
        await this.serveProjectAsNowV2(req, res, this.cwd, nowJson);
      }
    } catch (err) {
      this.setStatusError(err.message);
      this.logDebug(err.stack);

      if (!res.finished) {
        res.writeHead(500);
        res.end(this.statusMessage);
      }
    }

    this.setStatusIdle();
  };

  /**
   * Serve project directory as static
   */
  serveProjectAsStatics = (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    cwd: string
  ) => {
    const filePath = req.url ? req.url.replace(/^\//, '') : '';
    const ignore = createIgnoreList(cwd);

    if (filePath && ignore.ignores(filePath)) {
      res.writeHead(404);
      res.end();
      return;
    }

    return serveStaticFile(req, res, cwd);
  };

  /**
   * Server project directory as now v2 app
   */
  serveProjectAsNowV2 = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    cwd: string,
    nowJson: any
  ) => {
    const {
      dest,
      status = 200,
      headers = {},
      uri_args
    } = devRouter(req, nowJson.routes);

    res.writeHead(status, headers);

    if (isURL(dest)) {
      return proxyPass(req, res, dest);
    }

    if ([301, 302, 404].includes(status)) {
      return res.end();
    }

    if (!nowJson.builds) {
      return res.end();
    }

    // build source files to assets
    this.logDebug('Start builders', nowJson.builds);
    const assets = await buildUserProject(nowJson.builds, this);

    this.logDebug('Built', Object.keys(assets));

    // find asset responsible for dest
    const asset = resolveDest(assets, dest);

    if (asset === undefined) {
      res.writeHead(404);
      return res.end();
    }

    // invoke asset
    switch (asset.type) {
      case 'FileFsRef':
        return serveStaticFile(req, res, cwd);

      case 'Lambda':
        const fn = await createFunction({
          Code: { ZipFile: asset.zipBuffer },
          Handler: asset.handler,
          Runtime: asset.runtime,
          Environment: asset.environment
        });

        // const invoked = await fn({
        //   InvocationType: 'RequestResponse',
        //   Payload: JSON.stringify({
        //     method: req.method,
        //     path: req.url,
        //     headers: req.headers,
        //     encoding: 'base64',
        //     body: 'eyJlaXlvIjp0cnVlfQ=='
        //   })
        // });

        // TODO: go on here after error resolved.
        console.log(777, uri_args, fn);
        return res.end(`TODO: invoke ${fn}`);

      default:
        res.writeHead(500);
        return res.end();
    }
  };
}

/**
 * Mimic nginx's proxy_pass
 * for routes using a url as dest.
 */
function proxyPass(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  dest: string
): void {
  const proxy = httpProxy.createProxyServer({
    changeOrigin: true,
    target: dest
  });

  return proxy.web(req, res);
}

/**
 * Handle requests for static files with serve-handler
 */
function serveStaticFile(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  cwd: string
) {
  return serveHandler(req, res, {
    public: cwd,
    cleanUrls: false
  });
}

/**
 * Find the dest handler from assets
 */
function resolveDest(assets: BuilderOutputs, dest: string): BuilderOutput {
  const assetKey = dest.replace(/^\//, '');

  // TODO: more cases, go, rust, php, etc.
  return (
    assets[assetKey] ||
    assets[assetKey + 'index.js'] ||
    assets[assetKey + '/index.js'] ||
    assets[assetKey + '/index.html']
  );
}

/**
 * A naive isURL
 */
function isURL(str: any): boolean {
  return typeof str === 'string' && /^https?:\/\//.test(str);
}
