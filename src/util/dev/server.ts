import ms from 'ms';
import url from 'url';
import http from 'http';
import fs from 'fs-extra';
import chalk from 'chalk';
import plural from 'pluralize';
import rawBody from 'raw-body';
import listen from 'async-listen';
import minimatch from 'minimatch';
import httpProxy from 'http-proxy';
import { randomBytes } from 'crypto';
import serveHandler from 'serve-handler';
import { watch, FSWatcher } from 'chokidar';
import { parse as parseDotenv } from 'dotenv';
import { basename, dirname, extname, join } from 'path';
import directoryTemplate from 'serve-handler/src/directory';

import {
  FileFsRef,
  PackageJson,
  detectBuilder,
  detectApiBuilders,
  detectApiRoutes
} from '@now/build-utils';

import { once } from '../once';
import { Output } from '../output';
import { relative } from '../path-helpers';
import getNowJsonPath from '../config/local-path';
import { MissingDotenvVarsError } from '../errors-ts';
import {
  createIgnore,
  staticFiles as getFiles,
  getApiFiles
} from '../get-files';

import isURL from './is-url';
import devRouter from './router';
import getMimeType from './mime-type';
import { getYarnPath } from './yarn-installer';
import { executeBuild, getBuildMatches } from './builder';
import {
  builderDirPromise,
  installBuilders,
  updateBuilders
} from './builder-cache';

import {
  EnvConfig,
  NowConfig,
  DevServerOptions,
  BuildConfig,
  BuildMatch,
  BuildResult,
  BuilderInputs,
  BuilderOutput,
  HttpHandler,
  InvokePayload,
  InvokeResult,
  RouteConfig,
  RouteResult
} from './types';

interface FSEvent {
  type: string;
  path: string;
}

interface NodeRequire {
  (id: string): any;
  cache: {
    [name: string]: any;
  };
}

declare const __non_webpack_require__: NodeRequire;

export default class DevServer {
  public cwd: string;
  public debug: boolean;
  public output: Output;
  public env: EnvConfig;
  public buildEnv: EnvConfig;
  public files: BuilderInputs;
  public yarnPath: string;
  public address: string;

  private cachedNowJson: NowConfig | null;
  private server: http.Server;
  private stopping: boolean;
  private serverUrlPrinted: boolean;
  private buildMatches: Map<string, BuildMatch>;
  private inProgressBuilds: Map<string, Promise<void>>;
  private watcher?: FSWatcher;
  private watchAggregationId: NodeJS.Timer | null;
  private watchAggregationEvents: FSEvent[];
  private watchAggregationTimeout: number;
  private filter: ((path: string) => boolean);

  constructor(cwd: string, options: DevServerOptions) {
    this.cwd = cwd;
    this.debug = options.debug;
    this.output = options.output;
    this.env = {};
    this.buildEnv = {};
    this.files = {};
    this.address = '';

    // This gets updated when `start()` is invoked
    this.yarnPath = '/';

    this.cachedNowJson = null;
    this.server = http.createServer(this.devServerHandler);
    this.serverUrlPrinted = false;
    this.stopping = false;
    this.buildMatches = new Map();
    this.inProgressBuilds = new Map();

    this.watchAggregationId = null;
    this.watchAggregationEvents = [];
    this.watchAggregationTimeout = 500;

    this.filter = (path) => Boolean(path);
  }

  enqueueFsEvent(type: string, path: string): void {
    this.watchAggregationEvents.push({ type, path });
    if (this.watchAggregationId === null) {
      this.watchAggregationId = setTimeout(() => {
        const events = this.watchAggregationEvents.slice();
        this.watchAggregationEvents.length = 0;
        this.watchAggregationId = null;
        this.handleFilesystemEvents(events);
      }, this.watchAggregationTimeout);
    }
  }

  async handleFilesystemEvents(events: FSEvent[]): Promise<void> {
    this.output.debug(`Filesystem watcher notified of ${events.length} events`);

    const filesChanged: Set<string> = new Set();
    const filesRemoved: Set<string> = new Set();

    // First, update the `files` mapping of source files
    for (const event of events) {
      if (event.type === 'add') {
        await this.handleFileCreated(event.path, filesChanged, filesRemoved);
      } else if (event.type === 'unlink') {
        this.handleFileDeleted(event.path, filesChanged, filesRemoved);
      } else if (event.type === 'change') {
        await this.handleFileModified(event.path, filesChanged, filesRemoved);
      }
    }

    if (filesChanged.has('now.json') || filesRemoved.has('now.json')) {
      // The `now.json` file was changed, so invalidate the in-memory copy
      this.output.debug('Invalidating cached `now.json`');
    }

    // Update the build matches in case an entrypoint was created or deleted
    const nowJson = await this.getNowJson(false);
    await this.updateBuildMatches(nowJson);

    const filesChangedArray = [...filesChanged];
    const filesRemovedArray = [...filesRemoved];

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
          for (const pattern of result.watch) {
            if (
              minimatches(filesChangedArray, pattern) ||
              minimatches(filesRemovedArray, pattern)
            ) {
              needsRebuild.set(result, [requestPath, match]);
              break;
            }
          }
        }
      }
    }

    if (needsRebuild.size > 0) {
      this.output.debug(`Triggering ${needsRebuild.size} rebuilds`);
      if (filesChangedArray.length > 0) {
        this.output.debug(`Files changed: ${filesChangedArray.join(', ')}`);
      }
      if (filesRemovedArray.length > 0) {
        this.output.debug(`Files removed: ${filesRemovedArray.join(', ')}`);
      }
      for (const [result, [requestPath, match]] of needsRebuild) {
        if (
          requestPath === null ||
          (await shouldServe(match, this.files, requestPath, this))
        ) {
          this.triggerBuild(
            match,
            requestPath,
            null,
            result,
            filesChangedArray,
            filesRemovedArray
          ).catch((err: Error) => {
            this.output.warn(`An error occured while rebuilding ${match.src}:`);
            console.error(err.stack);
          });
        } else {
          this.output.debug(
            `Not rebuilding because \`shouldServe()\` returned \`false\` for "${
              match.use
            }" request path "${requestPath}"`
          );
        }
      }
    }
  }

  async handleFileCreated(
    fsPath: string,
    changed: Set<string>,
    removed: Set<string>
  ): Promise<void> {
    const name = relative(this.cwd, fsPath);
    try {
      this.files[name] = await FileFsRef.fromFsPath({ fsPath });
      fileChanged(name, changed, removed);
      this.output.debug(`File created: ${name}`);
    } catch (err) {
      if (err.code === 'ENOENT') {
        this.output.debug(`File created, but has since been deleted: ${name}`);
        fileRemoved(name, this.files, changed, removed);
      } else {
        throw err;
      }
    }
  }

  handleFileDeleted(
    fsPath: string,
    changed: Set<string>,
    removed: Set<string>
  ): void {
    const name = relative(this.cwd, fsPath);
    this.output.debug(`File deleted: ${name}`);
    fileRemoved(name, this.files, changed, removed);
  }

  async handleFileModified(
    fsPath: string,
    changed: Set<string>,
    removed: Set<string>
  ): Promise<void> {
    const name = relative(this.cwd, fsPath);
    try {
      this.files[name] = await FileFsRef.fromFsPath({ fsPath });
      fileChanged(name, changed, removed);
      this.output.debug(`File modified: ${name}`);
    } catch (err) {
      if (err.code === 'ENOENT') {
        this.output.debug(`File modified, but has since been deleted: ${name}`);
        fileRemoved(name, this.files, changed, removed);
      } else {
        throw err;
      }
    }
  }

  async updateBuildMatches(nowJson: NowConfig): Promise<void> {
    const matches = await getBuildMatches(
      nowJson,
      this.cwd,
      this.yarnPath,
      this.output
    );
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

  async invalidateBuildMatches(
    nowJson: NowConfig,
    updatedBuilders: string[]
  ): Promise<void> {
    if (updatedBuilders.length === 0) {
      this.output.debug('No builders were updated');
      return;
    }

    // The `require()` cache for the builder's assets must be purged
    const builderDir = await builderDirPromise;
    const updatedBuilderPaths = updatedBuilders.map(b =>
      join(builderDir, 'node_modules', b)
    );
    for (const id of Object.keys(__non_webpack_require__.cache)) {
      for (const path of updatedBuilderPaths) {
        if (id.startsWith(path)) {
          this.output.debug(`Purging require cache for "${id}"`);
          delete __non_webpack_require__.cache[id];
        }
      }
    }

    // Delete any build matches that have the old builder required already
    for (const buildMatch of this.buildMatches.values()) {
      const {
        src,
        builderWithPkg: { package: pkg }
      } = buildMatch;
      if (pkg.name === '@now/static') continue;
      if (updatedBuilders.includes(pkg.name)) {
        this.buildMatches.delete(src);
        this.output.debug(`Invalidated build match for "${src}"`);
      }
    }

    // Re-add the build matches that were just removed, but with the new builder
    await this.updateBuildMatches(nowJson);
  }

  async getLocalEnv(fileName: string, base?: EnvConfig): Promise<EnvConfig> {
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
    try {
      this.validateEnvConfig(fileName, base || {}, env);
    } catch (err) {
      if (err instanceof MissingDotenvVarsError) {
        this.output.error(err.message);
        process.exit(1);
      } else {
        throw err;
      }
    }
    return { ...base, ...env };
  }

  async getNowJson(canUseCache: boolean = true): Promise<NowConfig> {
    if (canUseCache && this.cachedNowJson) {
      return this.cachedNowJson;
    }

    const pkg = await this.getPackageJson();

    // The default empty `now.json` is used to serve all files as static
    // when no `now.json` is present
    let config: NowConfig = this.cachedNowJson || { version: 2 };

    // We need to delete these properties for zero config to work
    // with file changes
    if (this.cachedNowJson) {
      delete this.cachedNowJson.builds;
      delete this.cachedNowJson.routes;
    }

    try {
      this.output.debug('Reading `now.json` file');
      const nowJsonPath = getNowJsonPath(this.cwd);
      config = JSON.parse(await fs.readFile(nowJsonPath, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') {
        if (pkg === null) {
          this.output.note(
            'No `now.json` file present, serving all files as static'
          );
        }
      } else if (err.name === 'SyntaxError') {
        this.output.warn(
          `There is a syntax error in the \`now.json\` file: ${err.message}`
        );
      } else {
        throw err;
      }
    }

    const _apiFiles = await getApiFiles(this.cwd, this.output);
    const apiFiles = _apiFiles.filter(this.filter);

    this.output.debug(
      `Found ${_apiFiles.length} files in \`api\` and ` +
      `filtered out ${_apiFiles.length - apiFiles.length} files`
    );

    const hasNoBuilds = !config.builds || config.builds.length === 0;

    if (apiFiles.length > 0 && hasNoBuilds) {
      const apiBuilds = await detectApiBuilders(apiFiles);

      if (apiBuilds && apiBuilds.length > 0) {
        config.builds = config.builds || [];
        config.builds.push(...apiBuilds);
      }

      const { defaultRoutes, error } = await detectApiRoutes(apiFiles);

      if (error) {
        this.output.error(error.message);
      } else if (defaultRoutes && defaultRoutes.length > 0) {
        this.output.debug(`Found ${defaultRoutes.length} routes for \`api\``);
        config.routes = config.routes || [];
        config.routes.push(...(defaultRoutes as RouteConfig[]));
      }
    }

    /**
     * We need to use `hasNoBuilds` because it was created
     * before the api builders were added.
     * We also have to add this builder after all
     * the others to prevent catch all routes etc.
     */
    if (pkg && hasNoBuilds) {
      config.builds = config.builds || [];

      const { builder: staticBuilder, warnings } = await detectBuilder(pkg);

      if (Array.isArray(warnings)) {
        warnings.forEach(({ message }) => this.output.warn(message));
      }

      if (staticBuilder) {
        config.builds.push(staticBuilder);
      }
    }

    if (Array.isArray(config.builds)) {
      // `@now/static-build` needs to be the last builder
      // since it might catch all other requests
      config.builds.sort((buildA, buildB) => {
        if (buildA.use.startsWith('@now/static-build')) {
          return 1;
        }

        if (buildB.use.startsWith('@now/static-build')) {
          return -1;
        }

        return 0;
      });
    }

    this.validateNowConfig(config);
    this.cachedNowJson = config;
    return config;
  }

  async getPackageJson(): Promise<PackageJson | null> {
    const pkgPath = join(this.cwd, 'package.json');
    let pkg: PackageJson | null = null;

    this.output.debug('Reading `package.json` file');

    try {
      pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') {
        this.output.note(
          'No `package.json` file present, trying to find `now.json`'
        );
      } else if (err.name === 'SyntaxError') {
        this.output.warn(
          `There is a syntax error in the \`package.json\` file: ${err.message}`
        );
      } else {
        throw err;
      }
    }

    return pkg;
  }

  validateNowConfig(config: NowConfig): void {
    if (config.version !== 2) {
      throw new Error('Only `version: 2` is supported by `now dev`');
    }
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
      .map(([name]) => name);
    if (missing.length >= 1) {
      throw new MissingDotenvVarsError(type, missing);
    }
  }

  /**
   * Launches the `now dev` server.
   */
  async start(port: number = 3000): Promise<void> {
    if (!fs.existsSync(this.cwd)) {
      throw new Error(`${chalk.bold(this.cwd)} doesn't exist`);
    }

    if (!fs.lstatSync(this.cwd).isDirectory()) {
      throw new Error(`${chalk.bold(this.cwd)} is not a directory`);
    }

    this.yarnPath = await getYarnPath(this.output);

    const ig = await createIgnore(join(this.cwd, '.nowignore'));
    this.filter = ig.createFilter();

    // Retrieve the path of the native module
    const nowJson = await this.getNowJson();
    const nowJsonBuild = nowJson.build || {};
    const [env, buildEnv] = await Promise.all([
      this.getLocalEnv('.env', nowJson.env),
      this.getLocalEnv('.env.build', nowJsonBuild.env)
    ]);
    Object.assign(process.env, buildEnv);
    this.env = env;
    this.buildEnv = buildEnv;

    const opts = { output: this.output, isBuilds: true };
    const files = await getFiles(this.cwd, nowJson, opts);
    const results: { [filePath: string]: FileFsRef } = {};
    for (const fsPath of files) {
      const path = relative(this.cwd, fsPath);
      const { mode } = await fs.promises.stat(fsPath);
      results[path] = new FileFsRef({ mode, fsPath });
    }
    this.files = results;

    const builders: Set<string> = new Set(
      (nowJson.builds || []).map((b: BuildConfig) => b.use)
    );

    await installBuilders(builders, this.yarnPath, this.output);
    await this.updateBuildMatches(nowJson);

    // Updating builders happens lazily, and any builders that were updated
    // get their "build matches" invalidated so that the new version is used.
    updateBuilders(builders, this.yarnPath, this.output)
      .then(updatedBuilders =>
        this.invalidateBuildMatches(nowJson, updatedBuilders)
      )
      .catch(err => {
        this.output.error(`Failed to update builders: ${err.message}`)
        this.output.debug(err.stack);
      });

    // Now Builders that do not define a `shouldServe()` function need to be
    // executed at boot-up time in order to get the initial assets and/or routes
    // that can be served by the builder.
    const needsInitialBuild = Array.from(this.buildMatches.values()).filter(
      (buildMatch: BuildMatch) => {
        const { builder } = buildMatch.builderWithPkg;
        return typeof builder.shouldServe !== 'function';
      }
    );
    if (needsInitialBuild.length > 0) {
      this.output.log(
        `Creating initial ${plural('build', needsInitialBuild.length)}`
      );

      for (const match of needsInitialBuild) {
        await executeBuild(nowJson, this, this.files, match, null, true);
      }

      this.output.success('Build completed');
    }

    // Start the filesystem watcher
    this.watcher = watch(this.cwd, {
      ignored: (path: string) => !this.filter(path),
      ignoreInitial: true,
      useFsEvents: false,
      usePolling: false,
      persistent: true
    });
    this.watcher.on('add', (path: string) => {
      this.enqueueFsEvent('add', path);
    });
    this.watcher.on('change', (path: string) => {
      this.enqueueFsEvent('change', path);
    });
    this.watcher.on('unlink', (path: string) => {
      this.enqueueFsEvent('unlink', path);
    });
    this.watcher.on('error', (err: Error) => {
      this.output.error(`Watcher error: ${err}`);
    });

    // Wait for "ready" event of the watcher
    await once(this.watcher, 'ready');

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

    this.address = address.replace('[::]', 'localhost');
    this.output.ready(`Available at ${chalk.cyan.underline(this.address)}`);

    this.serverUrlPrinted = true;
  }

  /**
   * Shuts down the `now dev` server, and cleans up any temporary resources.
   */
  async stop(): Promise<void> {
    if (this.stopping) return;

    this.stopping = true;

    if (this.serverUrlPrinted) {
      // This makes it look cleaner
      process.stdout.write('\n');
      this.output.log(`Stopping ${chalk.bold('`now dev`')} server`);
    }

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

    if (this.watcher) {
      this.watcher.close();
    }

    try {
      await Promise.all(ops);
    } catch (err) {
      if (err.code === 'ERR_SERVER_NOT_RUNNING') {
        process.exit(0);
      } else {
        throw err;
      }
    }
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
      'cache-control': 'public, max-age=0, must-revalidate',
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
      Connection: 'close',
      'x-forwarded-host': host,
      'x-forwarded-proto': 'http',
      'x-forwarded-for': ip,
      'x-real-ip': ip,
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
    filesChanged?: string[],
    filesRemoved?: string[]
  ) {
    // If the requested asset wasn't found in the match's outputs, or
    // a hard-refresh was detected, then trigger a build
    const buildKey =
      requestPath === null ? match.src : `${match.src}-${requestPath}`;
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
      if (previousBuildResult) {
        // Tear down any `output` assets from a previous build, so that they
        // are not available to be served while the rebuild is in progress.
        for (const [name] of Object.entries(previousBuildResult.output)) {
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
        false,
        filesChanged,
        filesRemoved
      );
      this.inProgressBuilds.set(buildKey, buildPromise);
    }
    try {
      await buildPromise;
    } finally {
      this.output.debug(`Built asset ${buildKey}`);
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

    try {
      const nowJson = await this.getNowJson();
      await this.serveProjectAsNowV2(req, res, nowRequestId, nowJson);
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
   * Serve project directory as a Now v2 deployment.
   */
  serveProjectAsNowV2 = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    nowRequestId: string,
    nowJson: NowConfig,
    routes: RouteConfig[] | undefined = nowJson.routes
  ) => {
    await this.updateBuildMatches(nowJson);

    const {
      dest,
      status,
      headers = {},
      uri_args,
      matched_route
    } = await devRouter(req.url, req.method, routes, this);

    // Set any headers defined in the matched `route` config
    Object.entries(headers).forEach(([name, value]) => {
      res.setHeader(name, value);
    });

    if (isURL(dest)) {
      // Mix the `routes` result dest query params into the req path
      const parsed = url.parse(dest, true);
      delete parsed.search;
      Object.assign(parsed.query, uri_args);
      const destUrl = url.format(parsed);

      this.output.debug(`ProxyPass: ${destUrl}`);
      this.setResponseHeaders(res, nowRequestId);
      return proxyPass(req, res, destUrl, this.output);
    }

    if (status) {
      res.statusCode = status;
      if ([301, 302, 303].includes(status)) {
        this.output.debug(`Redirect: ${matched_route}`);
        res.end(`Redirecting (${status}) to ${res.getHeader('location')}`);
      } else if (status === 404) {
        await this.send404(req, res, nowRequestId);
      } else {
        res.end(`${status} status code from routes config`);
      }
      return;
    }

    const requestPath = dest.replace(/^\//, '');
    const match = await findBuildMatch(
      this.buildMatches,
      this.files,
      requestPath,
      this
    );
    if (!match) {
      if (!this.renderDirectoryListing(req, res, requestPath, nowRequestId)) {
        await this.send404(req, res, nowRequestId);
      }
      return;
    }

    const buildRequestPath = match.buildResults.has(null) ? null : requestPath;
    const buildResult = match.buildResults.get(buildRequestPath);

    if (
      buildResult &&
      Array.isArray(buildResult.routes) &&
      buildResult.routes.length > 0
    ) {
      const origUrl = url.parse(req.url || '/', true);
      delete origUrl.search;
      origUrl.pathname = dest;
      Object.assign(origUrl.query, uri_args);
      const newUrl = url.format(origUrl);
      this.output.debug(
        `Checking build result's ${
          buildResult.routes.length
        } \`routes\` to match ${newUrl}`
      );
      const matchedRoute = await devRouter(
        newUrl,
        req.method,
        buildResult.routes,
        this
      );
      if (matchedRoute.found) {
        this.output.debug(
          `Found matching route ${matchedRoute.dest} for ${newUrl}`
        );
        req.url = newUrl;
        await this.serveProjectAsNowV2(
          req,
          res,
          nowRequestId,
          nowJson,
          buildResult.routes
        );
        return;
      }
    }

    let foundAsset = findAsset(match, requestPath);
    if (!foundAsset || this.shouldRebuild(req)) {
      await this.triggerBuild(match, buildRequestPath, req);

      // Since the `asset` was re-built, resolve it again to get the new asset
      foundAsset = findAsset(match, requestPath);
    }

    if (!foundAsset) {
      await this.send404(req, res, nowRequestId);
      return;
    }

    const { asset, assetKey } = foundAsset;
    this.output.debug(`Serving asset: [${asset.type}] ${assetKey}`);

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

        this.output.debug(`Invoking lambda: "${assetKey}" with ${path}`);

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

  renderDirectoryListing(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    requestPath: string,
    nowRequestId: string
  ): boolean {
    let prefix = requestPath;
    if (prefix.length > 0 && !prefix.endsWith('/')) {
      prefix += '/';
    }

    const dirs: Set<string> = new Set();
    const files = Array.from(this.buildMatches.keys())
      .filter(p => {
        const base = basename(p);
        if (
          base === 'now.json' ||
          base === '.nowignore' ||
          !p.startsWith(prefix)
        ) {
          return false;
        }
        const rel = relative(prefix, p);
        if (rel.includes('/')) {
          const dir = rel.split('/')[0];
          if (dirs.has(dir)) {
            return false;
          }
          dirs.add(dir);
        }
        return true;
      })
      .map(p => {
        let base = basename(p);
        let ext = '';
        let type = 'file';
        let href: string;

        const rel = relative(prefix, p);
        if (rel.includes('/')) {
          // Directory
          type = 'folder';
          base = rel.split('/')[0];
          href = `/${prefix}${base}/`;
        } else {
          // File / Lambda
          ext = extname(p).substring(1);
          href = `/${prefix}${base}`;
        }
        return {
          type,
          relative: href,
          ext,
          title: href,
          base
        };
      });

    if (files.length === 0) {
      return false;
    }

    const directory = `/${prefix}`;
    const paths = [
      {
        name: directory,
        url: requestPath
      }
    ];
    const directoryHtml = directoryTemplate({
      files,
      paths,
      directory
    });
    this.setResponseHeaders(res, nowRequestId);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader(
      'Content-Length',
      String(Buffer.byteLength(directoryHtml, 'utf8'))
    );
    res.end(directoryHtml);
    return true;
  }

  /**
   * Serve project directory as a static deployment.
   */
  serveProjectAsStatic = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    nowRequestId: string
  ) => {
    const filePath = req.url ? req.url.replace(/^\//, '') : '';

    if (filePath && typeof this.files[filePath] === 'undefined') {
      await this.send404(req, res, nowRequestId);
      return;
    }

    this.setResponseHeaders(res, nowRequestId);
    return serveStaticFile(req, res, this.cwd, { cleanUrls: true });
  };

  async hasFilesystem(dest: string): Promise<boolean> {
    const requestPath = dest.replace(/^\//, '');
    if (
      await findBuildMatch(this.buildMatches, this.files, requestPath, this)
    ) {
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
  dest: string,
  output: Output
): void {
  const proxy = httpProxy.createProxyServer({
    changeOrigin: true,
    ws: true,
    xfwd: true,
    ignorePath: true,
    target: dest
  });

  proxy.on('error', (error: NodeJS.ErrnoException) => {
    // If the client hangs up a socket, we do not
    // want to do anything, as the client just expects
    // the connection to be closed.
    if (error.code === 'ECONNRESET') {
      res.end();
      return;
    }

    output.error(`Failed to complete request to ${req.url}: ${error}`);
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
    etag: true,
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
 * Example: dev1:q4wlg-1562364135397-7a873ac99c8e
 */
function generateRequestId(): string {
  return `dev1:${[
    Math.random()
      .toString(32)
      .slice(-5),
    Date.now(),
    randomBytes(6).toString('hex')
  ].join('-')}`;
}

function hasOwnProperty(obj: any, prop: string) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

async function findBuildMatch(
  matches: Map<string, BuildMatch>,
  files: BuilderInputs,
  requestPath: string,
  devServer: DevServer
): Promise<BuildMatch | null> {
  for (const match of matches.values()) {
    if (await shouldServe(match, files, requestPath, devServer)) {
      return match;
    }
  }
  return null;
}

async function shouldServe(
  match: BuildMatch,
  files: BuilderInputs,
  requestPath: string,
  devServer: DevServer
): Promise<boolean> {
  const {
    src: entrypoint,
    config,
    builderWithPkg: { builder, package: pkg }
  } = match;
  if (typeof builder.shouldServe === 'function') {
    const shouldServe = await builder.shouldServe({
      entrypoint,
      files,
      config,
      requestPath,
      workPath: devServer.cwd
    });
    if (shouldServe) {
      return true;
    }
  } else if (findAsset(match, requestPath)) {
    // If there's no `shouldServe()` function, then look up if there's
    // a matching build asset on the `match` that has already been built.
    return true;
  } else if (await findMatchingRoute(match, requestPath, devServer)) {
    // If there's no `shouldServe()` function and no matched asset, then look
    // up if there's a matching build route on the `match` that has already
    // been built.
    return true;
  }
  return false;
}

async function findMatchingRoute(
  match: BuildMatch,
  requestPath: string,
  devServer: DevServer
): Promise<RouteResult | void> {
  const reqUrl = `/${requestPath}`;
  for (const buildResult of match.buildResults.values()) {
    if (!Array.isArray(buildResult.routes)) continue;
    const route = await devRouter(
      reqUrl,
      undefined,
      buildResult.routes,
      devServer
    );
    if (route.found) {
      return route;
    }
  }
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

function minimatches(files: string[], pattern: string): boolean {
  return files.some(file => file === pattern || minimatch(file, pattern));
}

function fileChanged(
  name: string,
  changed: Set<string>,
  removed: Set<string>
): void {
  changed.add(name);
  removed.delete(name);
}

function fileRemoved(
  name: string,
  files: BuilderInputs,
  changed: Set<string>,
  removed: Set<string>
): void {
  delete files[name];
  changed.delete(name);
  removed.add(name);
}
