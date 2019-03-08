import fs from 'fs';
import http from 'http';
import chalk from 'chalk';
import qs from 'querystring';
import rawBody from 'raw-body';
import { relative } from 'path';
import listen from 'async-listen';
import httpProxy from 'http-proxy';
import serveHandler from 'serve-handler';

import error from '../../../util/output/error';
import success from '../../../util/output/success';
import { readLocalConfig } from '../../../util/config/files';

import isURL from './is-url';
import devRouter from './dev-router';
import { buildUserProject, createIgnoreList } from './dev-builder';

import {
  DevServerStatus,
  DevServerOptions,
  BuilderOutput,
  BuilderOutputs,
  HttpHandler,
  InvokePayload,
  InvokeResult
} from './types';

export default class DevServer {
  public cwd: string;

  private debug: boolean;
  private server: http.Server;
  private assets: BuilderOutputs;
  private status: DevServerStatus;
  private statusMessage: string = '';

  constructor(cwd: string, options: DevServerOptions) {
    this.cwd = cwd;
    this.debug = options.debug;
    this.assets = {};
    this.server = http.createServer(this.devServerHandler);
    this.status = DevServerStatus.busy;
  }

  /* use dev-server as a "console" for logs. */
  logDebug(...args: any[]): void {
    if (this.debug) {
      console.log(chalk.yellowBright('> [debug]'), ...args);
    }
  }

  logError(str: string): void {
    console.log(error(str));
  }

  logSuccess(str: string): void {
    console.log(success(str));
  }

  logHttp(msg: string): void {
    console.log(`  ${chalk.green('>>>')} ${msg}`);
  }

  /* set dev-server status */

  setStatusIdle(): void {
    this.status = DevServerStatus.idle;
    this.statusMessage = '';
  }

  setStatusBusy(msg: string): void {
    this.status = DevServerStatus.busy;
    this.statusMessage = msg;
  }

  setStatusError(msg: string): void {
    this.status = DevServerStatus.error;
    this.statusMessage = msg;
  }

  /**
   * Launch dev-server
   */
  async start(port: number = 3000): Promise<void> {
    const nowJson = readLocalConfig(this.cwd);

    await listen(this.server, port);

    this.logSuccess(`Dev server listening on port ${chalk.bold(String(port))}`);

    // Initial build. Not meant to invoke, but to speed up future builds
    if (nowJson && Array.isArray(nowJson.builds)) {
      this.logDebug('Initial build');
      this.assets = await buildUserProject(nowJson.builds, this);
      console.log(this.assets);
      this.logSuccess('Initial build ready');
      this.logDebug('Built', Object.keys(this.assets));
    }

    this.setStatusIdle();
  }

  async stop(): Promise<void> {
    this.logDebug('Stopping `now dev` server');
    const ops = Object.values(this.assets).map((asset: BuilderOutput) => {
      if (asset.type !== 'Lambda' || !asset.fn) return;
      return asset.fn.destroy();
    });
    ops.push(close(this.server));
    await Promise.all(ops);
  }

  /**
   * dev-server http handler
   */
  devServerHandler: HttpHandler = async (req, res) => {
    this.logHttp(`${req.method} ${req.url}`);

    if (this.status === DevServerStatus.busy) {
      return res.end(`[busy] ${this.statusMessage}...`);
    }

    try {
      const nowJson = readLocalConfig(this.cwd);

      if (nowJson === null) {
        await this.serveProjectAsStatics(req, res, this.cwd);
      } else if (nowJson.version !== 2) {
        throw new Error('`now dev` only supports Now v2');
      } else {
        await this.serveProjectAsNowV2(req, res, this.cwd, nowJson);
      }
    } catch (err) {
      this.setStatusError(err.message);
      this.logDebug(err.stack);

      if (!res.finished) {
        res.statusCode = 500;
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
      res.statusCode = 404;
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
      uri_args,
      matched_route
    } = devRouter(req.url, nowJson.routes);

    // set headers
    Object.entries(headers).forEach(([name, value]) => {
      res.setHeader(name, value);
    });

    if (isURL(dest)) {
      this.logDebug('ProxyPass', matched_route);
      return proxyPass(req, res, dest);
    }

    if ([301, 302, 303].includes(status)) {
      this.logDebug('Redirect', matched_route);
      return res.end();
    }

    if (!nowJson.builds) {
      return serveStaticFile(req, res, cwd);
    }

    // build source files to assets
    //this.logDebug('Start builders', nowJson.builds);
    //const assets = await buildUserProject(nowJson.builds, this);
    //this.logDebug('Built', Object.keys(assets));

    // find asset responsible for dest
    const asset = resolveDest(this.assets, dest);

    if (!asset) {
      res.statusCode = 404;
      return res.end();
    }

    // invoke asset
    switch (asset.type) {
      case 'FileFsRef':
        const origUrl = req.url;
        req.url = `/${relative(cwd, asset.fsPath)}`;
        if (origUrl !== req.url) {
          this.logDebug(`Mapped request URL: ${origUrl} -> ${req.url}`);
        }
        return serveStaticFile(req, res, cwd);

      case 'Lambda':
        if (!asset.fn) {
          res.statusCode = 500;
          res.end('Lambda function has not been built');
          return;
        }

        const body = await rawBody(req);

        const payload: InvokePayload = {
          method: req.method || 'GET',
          path: req.url || '/',
          headers: req.headers,
          encoding: 'base64',
          body: body.toString('base64')
        };

        const result = await asset.fn<InvokeResult>({
          Action: 'Invoke',
          body: JSON.stringify(payload)
        });

        res.statusCode = result.statusCode;
        for (const [name, value] of Object.entries(result.headers)) {
          res.setHeader(name, value);
        }
        let resBody: Buffer | string | undefined;
        if (result.encoding === 'base64' && typeof result.body === 'string') {
          resBody = Buffer.from(result.body, 'base64');
        } else {
          resBody = result.body;
        }
        return res.end(resBody);
      default:
        res.statusCode = 500;
        return res.end();
    }
  };
}

/**
 * Mimic nginx's `proxy_pass` for routes using a URL as `dest`.
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
 * Handle requests for static files with serve-handler.
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
 * Find the dest handler from assets.
 */
function resolveDest(
  assets: BuilderOutputs,
  dest: string
): BuilderOutput | undefined {
  const assetKey = dest.replace(/^\//, '');

  if (assets[assetKey]) {
    return assets[assetKey];
  }

  // Find `${assetKey}/index.*` for indexes
  const foundIndex = Object.keys(assets).find(name => {
    const withoutIndex = name.replace(/\/?index(\.\w+)?$/, '');
    return withoutIndex === assetKey.replace(/\/$/, '');
  });

  if (foundIndex) {
    return assets[foundIndex];
  }
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err: Error) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}
