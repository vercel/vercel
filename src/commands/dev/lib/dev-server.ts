import http from 'http';
import fs from 'fs-extra';
import chalk from 'chalk';
import qs from 'querystring';
import rawBody from 'raw-body';
import { inspect } from 'util';
import listen from 'async-listen';
import httpProxy from 'http-proxy';
import serveHandler from 'serve-handler';
import { basename, dirname, relative } from 'path';
import { lookup as lookupMimeType } from 'mime-types';

import error from '../../../util/output/error';
import success from '../../../util/output/success';
import getNowJsonPath from '../../../util/config/local-path';

import isURL from './is-url';
import devRouter from './dev-router';
import {
  executeBuild,
  buildUserProject,
  createIgnoreList
} from './dev-builder';

import {
  NowConfig,
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
  public assets: BuilderOutputs;

  private debug: boolean;
  private server: http.Server;
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

  async getNowJson(): Promise<NowConfig | null> {
    const nowJsonPath = getNowJsonPath(this.cwd);

    try {
      const config: NowConfig = JSON.parse(
        await fs.readFile(nowJsonPath, 'utf8')
      );
      this.validateNowConfig(config);
      return config;
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }

    return null;
  }

  validateNowConfig(config: NowConfig): void {
    if (config.version !== 2) {
      throw new Error('Only `version: 2` is supported by `now dev`');
    }
    const buildConfig = config.build || {};
    const hasSecretEnv = [
      ...Object.values(config.env || {}),
      ...Object.values(buildConfig.env || {})
    ].some(val => val[0] === '@');
    if (hasSecretEnv) {
      throw new Error('Secret env vars are not yet supported by `now dev`');
    }
  }

  /**
   * Launches the `now dev` server.
   */
  async start(port: number = 3000): Promise<void> {
    const nowJson = await this.getNowJson();

    await listen(this.server, port);

    this.logSuccess(`Dev server listening on port ${chalk.bold(String(port))}`);

    // Initial build. Not meant to invoke, but to speed up future builds
    if (nowJson && Array.isArray(nowJson.builds)) {
      this.logDebug('Initial build');
      await buildUserProject(nowJson, this);
      this.logSuccess('Initial build ready');
      this.logDebug('Built', Object.keys(this.assets));
    }

    this.setStatusIdle();
  }

  /**
   * Shuts down the `now dev` server, and cleans up any temporary resources.
   */
  async stop(): Promise<void> {
    this.logDebug('Stopping `now dev` server');
    const ops = Object.values(this.assets).map((asset: BuilderOutput) => {
      if (asset.type === 'Lambda' && asset.fn) {
        return asset.fn.destroy();
      }
    });
    ops.push(close(this.server));
    await Promise.all(ops);
  }

  shouldRebuild(req: http.IncomingMessage): boolean {
    return (
      req.headers.pragma === 'no-cache' ||
      req.headers['cache-control'] === 'no-cache'
    );
  }

  async send404(res: http.ServerResponse): Promise<void> {
    return this.sendError(
      res,
      'FILE_NOT_FOUND',
      'The page could not be found',
      404
    );
  }

  async sendError(
    res: http.ServerResponse,
    code: string,
    message: string,
    statusCode: number = 500
  ): Promise<void> {
    // TODO: render an HTML page similar to Now's router
    res.statusCode = statusCode;
    res.end(`${statusCode}: ${message}\nCode: ${code}\n`);
  }

  /**
   * dev-server http handler
   */
  devServerHandler: HttpHandler = async (
    req: http.IncomingMessage,
    res: http.ServerResponse
  ) => {
    this.logHttp(`${req.method} ${req.url}`);

    if (this.status === DevServerStatus.busy) {
      return res.end(`[busy] ${this.statusMessage}...`);
    }

    try {
      const nowJson = await this.getNowJson();

      if (!nowJson) {
        await this.serveProjectAsStatic(req, res);
      } else {
        await this.serveProjectAsNowV2(req, res, nowJson);
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
   * Serve project directory as a static deployment.
   */
  serveProjectAsStatic = async (
    req: http.IncomingMessage,
    res: http.ServerResponse
  ) => {
    const filePath = req.url ? req.url.replace(/^\//, '') : '';
    const ignore = await createIgnoreList(this.cwd);

    if (filePath && ignore.ignores(filePath)) {
      await this.send404(res);
      return;
    }

    return serveStaticFile(req, res, this.cwd);
  };

  /**
   * Serve project directory as a Now v2 deployment.
   */
  serveProjectAsNowV2 = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    nowJson: NowConfig
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
      res.statusCode = status;
      return res.end(`Redirecting (${status}) to ${res.getHeader('location')}`);
    }

    if (!nowJson.builds) {
      return serveStaticFile(req, res, this.cwd);
    }

    // find asset responsible for dest
    let { asset, assetKey } = resolveDest(this.assets, dest);

    if (!asset || !assetKey) {
      await this.send404(res);
      return;
    }

    // If the user did a hard-refresh in the browser,
    // then re-run the build that generated this asset
    if (this.shouldRebuild(req) && asset.buildEntry) {
      const entrypoint = relative(this.cwd, asset.buildEntry.fsPath);
      this.logDebug('Rebuilding asset:', entrypoint);
      await executeBuild(nowJson, this, asset);

      // Since the `asset` was re-built, resolve it again to get the new asset
      // object
      ({ asset, assetKey } = resolveDest(this.assets, dest));

      if (!asset || !assetKey) {
        await this.send404(res);
        return;
      }
    }

    // invoke asset
    switch (asset.type) {
      case 'FileFsRef':
        req.url = `/${basename(asset.fsPath)}`;
        return serveStaticFile(req, res, dirname(asset.fsPath));

      case 'FileBlob':
        const contentType = lookupMimeType(assetKey);
        if (contentType) {
          res.setHeader('Content-Type', contentType);
        }
        res.setHeader('Content-Length', asset.data.length);
        res.end(asset.data);
        return;

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

        let result: InvokeResult;
        try {
          result = await asset.fn<InvokeResult>({
            Action: 'Invoke',
            body: JSON.stringify(payload)
          });
        } catch (err) {
          res.statusCode = 500;
          res.end(inspect(err));
          return;
        }

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
        // This shouldn't really ever happen...
        await this.sendError(
          res,
          'UNKNOWN_ASSET_TYPE',
          `Don't know how to handle asset type: ${(asset as any).type}`
        );
        return;
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
): { asset: BuilderOutput | null; assetKey: string | undefined } {
  let assetKey = dest.replace(/^\//, '');
  let asset: BuilderOutput | undefined = assets[assetKey];

  if (!asset) {
    // Find `${assetKey}/index.*` for indexes
    const indexKey = Object.keys(assets).find(name => {
      const withoutIndex = name.replace(/\/?index(\.\w+)?$/, '');
      return withoutIndex === assetKey.replace(/\/$/, '');
    });

    if (indexKey) {
      assetKey = indexKey;
      asset = assets[assetKey];
    }
  }

  return { asset, assetKey };
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err?: Error) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}
