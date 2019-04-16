import ms from 'ms';
import url from 'url';
import http from 'http';
import nsfw from '@zeit/nsfw';
import fs from 'fs-extra';
import chalk from 'chalk';
import rawBody from 'raw-body';
import { inspect } from 'util';
import listen from 'async-listen';
import minimatch from 'minimatch';
import httpProxy from 'http-proxy';
import { randomBytes } from 'crypto';
import serveHandler from 'serve-handler';
import { FileFsRef } from '@now/build-utils';
import { parse as parseDotenv } from 'dotenv';
import { basename, dirname, extname, join, relative } from 'path';

import { Output } from '../../../util/output';
import getNowJsonPath from '../../../util/config/local-path';
import isURL from './is-url';
import devRouter from './dev-router';
import getMimeType from './mime-type';
import { installBuilders } from './builder-cache';
import getModuleForNSFW from './nsfw-module';
import {
  executeBuild,
  collectProjectFiles,
  createIgnoreList,
  getBuildMatches
} from './dev-builder';

import { MissingDotenvVarsError } from '../../../util/errors-ts';

import {
  EnvConfig,
  NowConfig,
  DevServerOptions,
  BuildConfig,
  BuildMatch,
  BuildResult,
  BuilderInputs,
  BuilderOutput,
  BuilderOutputs,
  HttpHandler,
  InvokePayload,
  InvokeResult
} from './types';

export default class DevServer {
  public cwd: string;
  public output: Output;
  public env: EnvConfig;
  public buildEnv: EnvConfig;
  public files: BuilderInputs;

  private cachedNowJson: NowConfig | null;
  private server: http.Server;
  private stopping: boolean;
  private buildMatches: Map<string, BuildMatch>;
  private inProgressBuilds: Map<string, Promise<void>>;
  private originalEnv: EnvConfig;
  private nsfw?: nsfw.Watcher;

  constructor(cwd: string, options: DevServerOptions) {
    this.cwd = cwd;
    this.output = options.output;
    this.env = {};
    this.buildEnv = {};
    this.files = {};

    this.cachedNowJson = null;
    this.server = http.createServer(this.devServerHandler);
    this.stopping = false;
    this.buildMatches = new Map();
    this.inProgressBuilds = new Map();
    this.originalEnv = { ...process.env };
  }

  async handleFilesystemEvents(events: nsfw.Event[]): Promise<void> {
    const filesChanged: Set<string> = new Set();
    const filesRemoved: Set<string> = new Set();

    // First, update the `files` mapping of source files
    for (const event of events) {
      // TODO: for some reason the type inference isn't working, hence the casting
      if (event.action === nsfw.actions.CREATED) {
        await this.handleFileCreated(event as nsfw.CreatedEvent, filesChanged);
      } else if (event.action === nsfw.actions.DELETED) {
        this.handleFileDeleted(event as nsfw.DeletedEvent, filesRemoved);
      } else if (event.action === nsfw.actions.MODIFIED) {
        await this.handleFileModified(
          event as nsfw.ModifiedEvent,
          filesChanged
        );
      } else if (event.action === nsfw.actions.RENAMED) {
        await this.handleFileRenamed(
          event as nsfw.RenamedEvent,
          filesChanged,
          filesRemoved
        );
      }
    }

    if (filesChanged.has('now.json') || filesRemoved.has('now.json')) {
      // The `now.json` file was changed, so invalidate the in-memory copy
      this.output.debug('Invalidating cached `now.json`');
      this.cachedNowJson = null;
    }

    // Update the build matches in case an entrypoint was created or deleted
    const nowJson = await this.getNowJson();
    if (nowJson) {
      await this.updateBuildMatches(nowJson);
    }

    // Trigger rebuilds of any existing builds that are dependent
    // on one of the files that has changed
    const needsRebuild: Map<
      BuildResult,
      [string | null, BuildMatch]
    > = new Map();
    for (const match of this.buildMatches.values()) {
      for (const [requestPath, result] of match.buildResults) {
        // If the `BuildResult` is already queued for a re-build,
        // then we can skip subsequent lookups
        if (needsRebuild.has(result)) continue;

        if (Array.isArray(result.watch)) {
          for (const fileName of result.watch) {
            if (filesChanged.has(fileName) || filesRemoved.has(fileName)) {
              needsRebuild.set(result, [requestPath, match]);
              break;
            }
          }
        }
      }
    }

    if (needsRebuild.size > 0) {
      this.output.debug(`Triggering ${needsRebuild.size} rebuilds`);
      for (const [result, [requestPath, match]] of needsRebuild) {
        this.triggerBuild(
          match,
          requestPath,
          null,
          result,
          filesChanged,
          filesRemoved
        ).catch(err => {
          this.output.warn(`An error occured while rebuilding ${match.src}:`);
          console.error(err.stack);
        });
      }
    }
  }

  async handleFileCreated(
    event: nsfw.CreatedEvent,
    changed: Set<string>
  ): Promise<void> {
    const fsPath = join(event.directory, event.file);
    const name = relative(this.cwd, fsPath);
    this.output.debug(`File created: ${name}`);
    this.files[name] = await FileFsRef.fromFsPath({ fsPath });
    changed.add(name);
  }

  handleFileDeleted(event: nsfw.DeletedEvent, removed: Set<string>): void {
    const name = relative(this.cwd, join(event.directory, event.file));
    this.output.debug(`File deleted: ${name}`);
    delete this.files[name];
    removed.add(name);
  }

  async handleFileModified(
    event: nsfw.ModifiedEvent,
    changed: Set<string>
  ): Promise<void> {
    const fsPath = join(event.directory, event.file);
    const name = relative(this.cwd, fsPath);
    this.output.debug(`File modified: ${name}`);
    this.files[name] = await FileFsRef.fromFsPath({ fsPath });
    changed.add(name);
  }

  async handleFileRenamed(
    event: nsfw.RenamedEvent,
    changed: Set<string>,
    removed: Set<string>
  ): Promise<void> {
    const oldName = relative(this.cwd, join(event.directory, event.oldFile));
    removed.add(oldName);

    const fsPath = join(event.newDirectory, event.newFile);
    const name = relative(this.cwd, fsPath);
    changed.add(name);

    this.output.debug(`File renamed: ${oldName} -> ${name}`);
    delete this.files[oldName];
    this.files[name] = await FileFsRef.fromFsPath({ fsPath });
  }

  async updateBuildMatches(nowJson: NowConfig): Promise<void> {
    const matches = await getBuildMatches(nowJson, this.cwd);
    const sources = matches.map(m => m.src);

    // Delete build matches that no longer exists
    for (const src of this.buildMatches.keys()) {
      if (!sources.includes(src)) {
        this.output.debug(`Removing build match for "${src}"`);
        // TODO: shutdown lambda functions
        this.buildMatches.delete(src);
      }
    }

    // Add the new matches to the `buildMatches` map
    for (const match of matches) {
      const currentMatch = this.buildMatches.get(match.src);
      if (!currentMatch || currentMatch.use !== match.use) {
        this.output.debug(`Adding build match for "${match.src}"`);
        this.buildMatches.set(match.src, match);
      }
    }
  }

  async getLocalEnv(fileName: string): Promise<EnvConfig> {
    // TODO: use the file watcher to only invalidate the env `dotfile`
    // once a change to the `fileName` occurs
    const filePath = join(this.cwd, fileName);
    let env: EnvConfig = {};
    try {
      const dotenv = await fs.readFile(filePath, 'utf8');
      this.output.debug(`Using local env: ${filePath}`);
      env = parseDotenv(dotenv);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
    return env;
  }

  async getNowJson(): Promise<NowConfig | null> {
    if (this.cachedNowJson) {
      return this.cachedNowJson;
    }

    this.output.debug('Reading `now.json` file');
    const nowJsonPath = getNowJsonPath(this.cwd);

    try {
      const config: NowConfig = JSON.parse(
        await fs.readFile(nowJsonPath, 'utf8')
      );
      this.validateNowConfig(config);
      this.cachedNowJson = config;
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
    this.validateEnvConfig('.env', config.env, this.env);
    this.validateEnvConfig(
      '.env.build',
      config.build && config.build.env,
      this.buildEnv
    );
  }

  validateEnvConfig(
    type: string,
    env: EnvConfig = {},
    localEnv: EnvConfig = {}
  ): void {
    const missing: string[] = Object.entries(env)
      .filter(
        ([name, value]) =>
          typeof value === 'string' &&
          value.startsWith('@') &&
          !hasOwnProperty(localEnv, name)
      )
      .map(([name, value]) => name);
    if (missing.length >= 1) {
      throw new MissingDotenvVarsError(type, missing);
    }
  }

  /**
   * Sets the `build.env` vars onto `process.env`, since the builders are
   * executed in the now-cli process.
   */
  applyBuildEnv(nowJson: NowConfig): void {
    const buildEnv = nowJson.build && nowJson.build.env;
    Object.assign(process.env, buildEnv, this.buildEnv);
  }

  /**
   * Restores the original `process.env`, deleting any new env vars that
   * a builder might have set and then applying the original env vars.
   */
  restoreOriginalEnv(): void {
    for (const key of Object.keys(process.env)) {
      if (!hasOwnProperty(this.originalEnv, key)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, this.originalEnv);
  }

  /**
   * Launches the `now dev` server.
   */
  async start(port: number = 3000): Promise<void> {
    // Retrieve the path of the native module
    const modulePath = await getModuleForNSFW(this.output);

    // Collect files to watch
    this.files = await collectProjectFiles('**', this.cwd);

    // Start the filesystem watcher
    this.nsfw = await nsfw(this.cwd, this.handleFilesystemEvents.bind(this), {
      modulePath
    });

    await this.nsfw.start();

    const [env, buildEnv] = await Promise.all([
      this.getLocalEnv('.env'),
      this.getLocalEnv('.env.build')
    ]);
    this.env = env;
    this.buildEnv = buildEnv;
    const nowJson = await this.getNowJson();

    // Now Builders that do not define a `shouldServe()` function need to be
    // executed at boot-up time in order to get the initial assets that can be
    // routed to.
    if (nowJson) {
      const builders = (nowJson.builds || []).map((b: BuildConfig) => b.use);
      const shouldUpdate = true;
      await installBuilders(builders, shouldUpdate);
      await this.updateBuildMatches(nowJson);
      const needsInitialBuild = Array.from(this.buildMatches.values()).filter(
        (buildMatch: BuildMatch) => {
          const { builder } = buildMatch.builderWithPkg;
          return typeof builder.shouldServe !== 'function';
        }
      );
      if (needsInitialBuild.length > 0) {
        this.output.log('Running initial builds');
        for (const match of needsInitialBuild) {
          await executeBuild(nowJson, this, this.files, match);
        }
        this.output.success('Initial builds complete');
      }
    }

    let address: string | null = null;
    while (typeof address !== 'string') {
      try {
        address = await listen(this.server, port);
      } catch (err) {
        this.output.debug(`Got listen error: ${err.code}`);
        if (err.code === 'EADDRINUSE') {
          // Increase port and try again
          this.output.note(`Requested port ${port} is already in use`);
          port++;
        } else {
          throw err;
        }
      }
    }

    this.output.ready(
      `Development server running at ${chalk.cyan.underline(
        address.replace('[::]', 'localhost')
      )}`
    );
  }

  /**
   * Shuts down the `now dev` server, and cleans up any temporary resources.
   */
  async stop(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    this.output.log(`Stopping ${chalk.bold('`now dev`')} server`);
    const ops: Promise<void>[] = [];
    for (const match of this.buildMatches.values()) {
      if (!match.buildOutput) continue;
      for (const asset of Object.values(match.buildOutput)) {
        if (asset.type === 'Lambda' && asset.fn) {
          ops.push(asset.fn.destroy());
        }
      }
    }
    ops.push(close(this.server));
    if (this.nsfw) {
      ops.push(this.nsfw.stop());
    }
    await Promise.all(ops);
  }

  shouldRebuild(req: http.IncomingMessage): boolean {
    return (
      req.headers.pragma === 'no-cache' ||
      req.headers['cache-control'] === 'no-cache'
    );
  }

  async send404(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    nowRequestId: string
  ): Promise<void> {
    return this.sendError(
      req,
      res,
      nowRequestId,
      'FILE_NOT_FOUND',
      'The page could not be found',
      404
    );
  }

  async sendError(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    nowRequestId: string,
    code: string,
    message: string,
    statusCode: number = 500
  ): Promise<void> {
    res.statusCode = statusCode;
    this.setResponseHeaders(res, nowRequestId);
    // TODO: render an HTML page similar to Now's router
    res.end(`${statusCode}: ${message}\nCode: ${code}\n`);
  }

  getRequestIp(req: http.IncomingMessage): string {
    // TODO: respect the `x-forwarded-for` headers
    return req.connection.remoteAddress || '127.0.0.1';
  }

  /**
   * Sets the response `headers` including the Now headers to `res`.
   */
  setResponseHeaders(
    res: http.ServerResponse,
    nowRequestId: string,
    headers: http.OutgoingHttpHeaders = {}
  ): void {
    const allHeaders = {
      ...headers,
      'x-now-trace': 'dev1',
      'x-now-id': nowRequestId,
      'x-now-cache': 'MISS'
    };
    for (const [name, value] of Object.entries(allHeaders)) {
      res.setHeader(name, value);
    }
  }

  /**
   * Returns the request `headers` that will be sent to the Lambda.
   */
  getNowProxyHeaders(
    req: http.IncomingMessage,
    nowRequestId: string
  ): http.IncomingHttpHeaders {
    const ip = this.getRequestIp(req);
    const { host } = req.headers;
    return {
      ...req.headers,
      'X-Forwarded-Host': host,
      'X-Forwarded-Proto': 'http',
      'X-Forwarded-For': ip,
      'X-Real-IP': ip,
      Connection: 'close',
      'x-now-trace': 'dev1',
      'x-now-deployment-url': host,
      'x-now-id': nowRequestId,
      'x-now-log-id': nowRequestId.split('-')[2],
      'x-zeit-co-forwarded-for': ip
    };
  }

  async triggerBuild(
    match: BuildMatch,
    requestPath: string | null,
    req: http.IncomingMessage | null,
    previousBuildResult?: BuildResult,
    filesChanged?: Set<string>,
    filesRemoved?: Set<string>
  ) {
    // If the requested asset wasn't found in the match's outputs, or
    // a hard-refresh was detected, then trigger a build
    const buildKey = `${match.src}-${requestPath}`;
    let buildPromise = this.inProgressBuilds.get(buildKey);
    if (buildPromise) {
      // A build for `buildKey` is already in progress, so don't trigger
      // another rebuild for this request - just wait on the existing one.
      let msg = `De-duping build "${buildKey}"`;
      if (req) msg += ` for "${req.method} ${req.url}"`;
      this.output.debug(msg);
    } else if (Date.now() - match.buildTimestamp < ms('2s')) {
      // If the built asset was created less than 2s ago, then don't trigger
      // a rebuild. The purpose of this threshold is because once an HTML page
      // is rebuilt, then the CSS/JS/etc. assets on the page are also refreshed
      // with a `no-cache` header, so this avoids *two* rebuilds for that case.
      let msg = `Skipping build for "${buildKey}" (not older than 2s)`;
      if (req) msg += ` for "${req.method} ${req.url}"`;
      this.output.debug(msg);
    } else {
      const nowJson = await this.getNowJson();
      if (nowJson) {
        if (previousBuildResult) {
          // Tear down any `output` assets from a previous build, so that they
          // are not available to be served while the rebuild is in progress.
          for (const [name, asset] of Object.entries(
            previousBuildResult.output
          )) {
            this.output.debug(`Removing asset "${name}"`);
            delete match.buildOutput[name];
            // TODO: shut down Lambda instance
          }
        }
        let msg = `Building asset "${buildKey}"`;
        if (req) msg += ` for "${req.method} ${req.url}"`;
        this.output.debug(msg);
        buildPromise = executeBuild(
          nowJson,
          this,
          this.files,
          match,
          requestPath,
          filesChanged ? Array.from(filesChanged) : undefined,
          filesRemoved ? Array.from(filesRemoved) : undefined
        );
        this.inProgressBuilds.set(buildKey, buildPromise);
      } else {
        this.output.warn(
          'Skipping build because `now.json` could not be loaded'
        );
      }
    }
    try {
      await buildPromise;
    } finally {
      this.inProgressBuilds.delete(buildKey);
    }
  }

  /**
   * DevServer HTTP handler
   */
  devServerHandler: HttpHandler = async (
    req: http.IncomingMessage,
    res: http.ServerResponse
  ) => {
    const nowRequestId = generateRequestId();

    if (this.stopping) {
      res.setHeader('Connection', 'close');
      await this.send404(req, res, nowRequestId);
      return;
    }

    const method = req.method || 'GET';
    this.output.log(`${chalk.bold(method)} ${req.url}`);

    // if (this.status === DevServerStatus.busy) {
    //   return res.end(`[busy] ${this.statusMessage}...`);
    // }

    try {
      const nowJson = await this.getNowJson();
      if (nowJson) {
        await this.serveProjectAsNowV2(req, res, nowRequestId, nowJson);
      } else {
        await this.serveProjectAsStatic(req, res, nowRequestId);
      }
    } catch (err) {
      console.error(err);
      this.output.debug(err.stack);

      if (!res.finished) {
        res.statusCode = 500;
        res.end(err.message);
      }
    }
  };

  /**
   * Serve project directory as a static deployment.
   */
  serveProjectAsStatic = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    nowRequestId: string
  ) => {
    const filePath = req.url ? req.url.replace(/^\//, '') : '';
    const ignore = await createIgnoreList(this.cwd);

    if (filePath && ignore.ignores(filePath)) {
      await this.send404(req, res, nowRequestId);
      return;
    }

    this.setResponseHeaders(res, nowRequestId);
    return serveStaticFile(req, res, this.cwd);
  };

  /**
   * Serve project directory as a Now v2 deployment.
   */
  serveProjectAsNowV2 = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    nowRequestId: string,
    nowJson: NowConfig
  ) => {
    await this.updateBuildMatches(nowJson);

    const {
      dest,
      status = 200,
      headers = {},
      uri_args,
      matched_route
    } = await devRouter(req.url, nowJson.routes, this);

    // Set any headers defined in the matched `route` config
    Object.entries(headers).forEach(([name, value]) => {
      res.setHeader(name, value);
    });

    if (isURL(dest)) {
      this.output.debug(`ProxyPass: ${matched_route}`);
      return proxyPass(req, res, dest);
    }

    if ([301, 302, 303].includes(status)) {
      this.output.debug(`Redirect: ${matched_route}`);
      res.statusCode = status;
      return res.end(`Redirecting (${status}) to ${res.getHeader('location')}`);
    }

    const requestPath = dest.replace(/^\//, '');
    const match = await findBuildMatch(
      this.buildMatches,
      this.files,
      requestPath
    );
    if (!match) {
      await this.send404(req, res, nowRequestId);
      return;
    }

    let foundAsset = findAsset(match, requestPath);
    if (!foundAsset || this.shouldRebuild(req)) {
      await this.triggerBuild(match, requestPath, req);

      // Since the `asset` was re-built, resolve it again to get the new asset
      foundAsset = findAsset(match, requestPath);
    }

    if (!foundAsset) {
      await this.send404(req, res, nowRequestId);
      return;
    }

    const { asset, assetKey } = foundAsset;
    /* eslint-disable no-case-declarations */
    switch (asset.type) {
      case 'FileFsRef':
        this.setResponseHeaders(res, nowRequestId);
        req.url = `/${basename(asset.fsPath)}`;
        return serveStaticFile(req, res, dirname(asset.fsPath), {
          headers: [
            {
              source: '**/*',
              headers: [
                {
                  key: 'Content-Type',
                  value: getMimeType(assetKey)
                }
              ]
            }
          ]
        });

      case 'FileBlob':
        const headers: http.OutgoingHttpHeaders = {
          'Content-Length': asset.data.length,
          'Content-Type': getMimeType(assetKey)
        };
        this.setResponseHeaders(res, nowRequestId, headers);
        res.end(asset.data);
        return;

      case 'Lambda':
        if (!asset.fn) {
          // This is mostly to appease TypeScript since `fn` is an optional prop,
          // but this shouldn't really ever happen since we run the builds before
          // responding to HTTP requests.
          await this.sendError(
            req,
            res,
            nowRequestId,
            'INTERNAL_LAMBDA_NOT_FOUND',
            'Lambda function has not been built'
          );
          return;
        }

        // Mix the `routes` result dest query params into the req path
        const parsed = url.parse(req.url || '/', true);
        Object.assign(parsed.query, uri_args);
        const path = url.format({
          pathname: parsed.pathname,
          query: parsed.query
        });

        const body = await rawBody(req);
        const payload: InvokePayload = {
          method: req.method || 'GET',
          host: req.headers.host,
          path,
          headers: this.getNowProxyHeaders(req, nowRequestId),
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
          console.error(err);
          await this.sendError(
            req,
            res,
            nowRequestId,
            'NO_STATUS_CODE_FROM_LAMBDA',
            'An error occurred with your deployment',
            502
          );
          return;
        }

        res.statusCode = result.statusCode;
        this.setResponseHeaders(res, nowRequestId, result.headers);

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
          req,
          res,
          nowRequestId,
          'UNKNOWN_ASSET_TYPE',
          `Don't know how to handle asset type: ${(asset as any).type}`
        );
    }
  };

  async hasFilesystem(dest: string): Promise<boolean> {
    const requestPath = dest.replace(/^\//, '');
    if (await findBuildMatch(this.buildMatches, this.files, requestPath)) {
      return true;
    }
    return false;
  }
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
  cwd: string,
  opts?: object
) {
  return serveHandler(req, res, {
    public: cwd,
    cleanUrls: false,
    ...opts
  });
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

/**
 * Generates a (fake) Now tracing ID for an HTTP request.
 *
 * Example: lx24t-1553895116335-784edbc9ef03e2b5534f3dc6f14c90d4
 */
function generateRequestId(): string {
  return [
    Math.random()
      .toString(32)
      .slice(-5),
    Date.now(),
    randomBytes(16).toString('hex')
  ].join('-');
}

function hasOwnProperty(obj: any, prop: string) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

async function findBuildMatch(
  matches: Map<string, BuildMatch>,
  files: BuilderInputs,
  requestPath: string
): Promise<BuildMatch | null> {
  for (const match of matches.values()) {
    const {
      builderWithPkg: { builder, package: pkg }
    } = match;
    if (typeof builder.shouldServe === 'function') {
      const shouldServe = await builder.shouldServe({
        entrypoint: match.src,
        files,
        requestPath
      });
      if (shouldServe) {
        return match;
      }
    } else if (findAsset(match, requestPath)) {
      // If there's no `shouldServe()` function, then look up if there's
      // a matching build asset on the `match` that has already been built.
      return match;
    }
  }
  return null;
}

function findAsset(
  match: BuildMatch,
  requestPath: string
): { asset: BuilderOutput; assetKey: string } | void {
  if (!match.buildOutput) {
    return;
  }
  let assetKey: string = requestPath.replace(/\/$/, '');
  let asset = match.buildOutput[requestPath];

  // In the case of an index path, fall back to iterating over the
  // builder outputs and doing an "is index" check until a match is found.
  if (!asset) {
    for (const [name, a] of Object.entries(match.buildOutput)) {
      if (isIndex(name) && dirnameWithoutDot(name) === assetKey) {
        asset = a;
        assetKey = name;
        break;
      }
    }
  }

  if (asset) {
    return { asset, assetKey };
  }
}

function dirnameWithoutDot(path: string): string {
  let dir = dirname(path);
  if (dir === '.') {
    dir = '';
  }
  return dir;
}

function isIndex(path: string): boolean {
  const ext = extname(path);
  const name = basename(path, ext);
  return name === 'index';
}
