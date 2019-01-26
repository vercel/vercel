import fs from 'fs';
import path from 'path';
import http from 'http';

import chalk from 'chalk';
import ignore from 'ignore';
import serve from 'serve-handler';
import glob from '@now/build-utils/fs/glob';
import FileFsRef from '@now/build-utils/file-fs-ref';
// @ts-ignore
import { createFunction } from '../../../../lambdas/lambda-dev';

import wait from '../../util/output/wait';
import info from '../../util/output/info';
import error from '../../util/output/error';
import success from '../../util/output/success';
import { NowError } from '../../util/now-error';
import { readLocalConfig } from '../../util/config/files';

import builderCache from './builder-cache';
import devRouter from './dev-router';

import { DevServerStatus, BuildConfig, HttpHandler } from './types';

export default class DevServer {
  private cwd: string;
  private server: http.Server;
  private status: DevServerStatus;
  private statusMessage = '';
  private builderCacheDirectory = '';

  constructor(cwd: string) {
    this.cwd = cwd;
    this.server = http.createServer(this.devServerHandler);
    this.builderCacheDirectory = builderCache.prepare();
    this.status = DevServerStatus.busy;
  }

  /* use dev-server as a "console" for logs. */

  logInfo(str: string) {
    console.log(info(str));
  }

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
          await this.buildUserProject(nowJson.builds, this.cwd);
        }

        this.logSuccess('ready');
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
      return res.end('');
    }

    this.logHttp(req.url);

    try {
      const nowJson = readLocalConfig(this.cwd);

      if (nowJson === null) {
        await this.serveProjectAsStatics(req, res, this.cwd);
      } else if (nowJson.builds) {
        await this.serveBuilds(req, res, this.cwd, nowJson);
      }
    } catch (err) {
      this.setStatusError(err.message);
      console.error(err.stack);

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
    const ig = createIgnoreList(cwd);

    if (filePath && ig.ignores(filePath)) {
      res.writeHead(404);
      res.end();
      return;
    }

    return serve(req, res, {
      public: cwd,
      cleanUrls: false
    });
  };

  /**
   * Build & invoke project
   */
  serveBuilds = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    cwd: string,
    nowJson: any
  ) => {
    const assets = await this.buildUserProject(nowJson.builds, cwd);

    const matched = devRouter(req, assets, nowJson.routes);

    if (matched === undefined) {
      res.writeHead(404);
      res.end();
      return;
    }

    const {
      dest,
      status,
      headers = {},
      uri_args,
      matched_route,
      matched_route_idx
    } = matched;

    if (typeof dest === 'string') {
      return res.end(`TODO: proxy_pass to ${dest}`);
    }

    switch (dest.type) {
      case 'FileFsRef':
        return await serve(req, res, {
          public: cwd,
          cleanUrls: false
        });

      case 'Lambda':
        const fn = await createFunction({
          Code: { ZipFile: dest.zipBuffer },
          Handler: dest.handler,
          Runtime: dest.runtime,
          Environment: dest.environment
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
        console.log(fn);
        return res.end(`TODO: invoke ${fn}`);

      default:
        res.writeHead(500);
        res.end();
    }
  };

  /**
   * Build project to statics & lambdas
   */
  buildUserProject = async (buildsConfig: BuildConfig[], cwd: string) => {
    try {
      this.setStatusBusy('installing builders');
      await this.installBuilders(buildsConfig);

      this.setStatusBusy('building lambdas');
      const assets = await this.buildLambdas(buildsConfig, cwd);

      this.setStatusIdle();
      return assets;
    } catch (err) {
      this.setStatusIdle();
      throw new Error('Build failed.');
    }
  };

  installBuilders = async (buildsConfig: BuildConfig[]) => {
    const builders = buildsConfig
      .map(build => build.use)
      .filter(pkg => pkg !== '@now/static')
      .concat('@now/build-utils');

    for (const builder of builders) {
      const stopSpinner = wait(`installing ${builder}`);
      await builderCache.install(this.builderCacheDirectory, builder);
      stopSpinner();
    }
  };

  buildLambdas = async (buildsConfig: BuildConfig[], cwd: string) => {
    const ignores = createIgnoreList(cwd);
    const files = await collectProjectFiles('**', cwd, ignores);
    let results = {};

    for (const build of buildsConfig) {
      try {
        console.log(`> build ${JSON.stringify(build)}`);

        const builder = builderCache.get(this.builderCacheDirectory, build.use);

        const entries = Object.values(
          await collectProjectFiles(build.src, cwd, ignores)
        );

        for (const entry of entries) {
          const output = await builder.build({
            files,
            entrypoint: path.relative(cwd, entry.fsPath),
            workPath: cwd,
            config: build.config
          });
          results = { ...results, ...output };
        }
      } catch (err) {
        throw new NowError({
          code: 'NOW_BUILDER_FAILURE',
          message: `Failed building ${chalk.bold(build.src)} with ${build.use}`,
          meta: err.stack
        });
      }
    }

    return results;
  };
}

/**
 * Create ignore list according .gitignore & .nowignore in cwd
 */
function createIgnoreList(cwd: string) {
  const ig = ignore();

  const gitignore = path.join(cwd, '.gitignore');
  const nowignore = path.join(cwd, '.nowignore');

  if (fs.existsSync(gitignore)) {
    ig.add(fs.readFileSync(gitignore, 'utf8'));
  }

  if (fs.existsSync(nowignore)) {
    ig.add(fs.readFileSync(nowignore, 'utf8'));
  }

  // special case for now-cli's usage
  ig.add('.nowignore');

  // temp workround for excluding ncc/ & user/ folder generated by builders
  // should be removed later.
  ig.add('ncc');
  ig.add('user');

  return ig;
}

/**
 * Collect project files, with .gitignore and .nowignore honored.
 */
async function collectProjectFiles(pattern: string, cwd: string, ignore: any) {
  const files = await glob(pattern, cwd);
  const filteredFiles: { [key: string]: FileFsRef } = {};

  Object.entries(files).forEach(([name, file]) => {
    if (!ignore.ignores(name)) {
      filteredFiles[name] = file;
    }
  });

  return filteredFiles;
}
