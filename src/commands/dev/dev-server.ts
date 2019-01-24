import fs from 'fs';
import path from 'path';
import http from 'http';

import chalk from 'chalk';
import ignore from 'ignore';
// @ts-ignore
import serve from 'serve-handler';

// @ts-ignore
import glob from '@now/build-utils/fs/glob';
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

interface BuildConfig {
  src: string;
  use: string;
  config?: object;
}

enum DevServerStatus {
  busy,
  idle,
  error
}

type HttpHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => void;

export default class DevServer {
  private cwd: string;
  private server: http.Server;
  private status: DevServerStatus;
  private statusMessage = '';
  private builderDirectory = '';

  constructor(cwd: string, port = 3000) {
    this.cwd = cwd;
    this.server = http.createServer(this.devServerHandler);
    this.builderDirectory = builderCache.prepare();
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
          try {
            this.setStatusBusy('installing builders');
            await this.installBuilders(nowJson.builds);

            this.setStatusBusy('building lambdas');
            await this.buildLambdas(nowJson.builds);
          } catch (err) {
            reject(err);
          }
        }

        this.logSuccess('ready');
        this.setStatusIdle();
        resolve();
      });
    });
  };

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
        await this.serveStatics(req, res, this.cwd);
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
  serveStatics = (
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
    const assets = await this.buildUserProject(nowJson.builds);

    const matched = devRouter(req, assets, nowJson.routes);

    if (matched === undefined) {
      res.writeHead(404);
      res.end();
      return
    }

    const {
      dest,
      status,
      headers,
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
          public: this.cwd,
          cleanUrls: false
        });

      case 'Lambda':
        const fn = await createFunction({
          Code: { zipFile: dest.zipBuffer },
          Handler: dest.handler,
          Runtime: dest.runtime,
          Environment: dest.environment
        });

        // const invoked = await fn({
        //   InvocationType: 'RequestResponse',
        //   Payload: JSON.stringify({
        //     method: req.method,
        //     path: req.url,
        //     headers: { ...req.headers, ...(headers || {}) },
        //     encoding: 'base64',
        //     body: 'eyJlaXlvIjp0cnVlfQ=='
        //   })
        // })

        // TODO: go on here after error resolved.
        console.log(fn);
        return res.end(`invoked ${fn}`);

      default:
        res.writeHead(500);
        res.end();
    }
  };

  buildUserProject = async (buildsConfig: BuildConfig[]) => {
    try {
      this.setStatusBusy('installing builders');
      await this.installBuilders(buildsConfig);

      this.setStatusBusy('building lambdas');
      const assets = await this.buildLambdas(buildsConfig);

      this.setStatusIdle();
      return assets;
    } catch (err) {
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
      await builderCache.install(this.builderDirectory, builder);
      stopSpinner();
    }
  };

  buildLambdas = async (buildsConfig: BuildConfig[]) => {
    const ignores = createIgnoreList(this.cwd);
    const files = await collectProjectFiles('**', this.cwd, ignores);
    let results = {};

    for (const build of buildsConfig) {
      try {
        console.log(`> build ${JSON.stringify(build)}`);

        const builder = builderCache.get(this.builderDirectory, build.use);

        const entries = Object.values(
          await collectProjectFiles(build.src, this.cwd, ignores)
        );

        // TODO: hide those build logs from console.
        for (const entry of entries) {
          const output = await builder.build({
            files,
            // @ts-ignore: handle this warning later.
            entrypoint: path.relative(this.cwd, entry.fsPath),
            workPath: this.cwd,
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
 * Concat .gitignore & .nowignore in cwd
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

async function collectProjectFiles(pattern: string, cwd: string, ignore: any) {
  const files = await glob(pattern, cwd);
  const filteredFiles: { [key: string]: any } = {};

  Object.entries(files).forEach(([name, file]) => {
    if (!ignore.ignores(name)) {
      filteredFiles[name] = file;
    }
  });

  return filteredFiles;
}
