import once from '@tootallnate/once';
import url from 'url';
import { createRequire } from 'module';
import { promises as fsp } from 'fs';
import { join, dirname, extname, relative, resolve } from 'path';
import { spawn } from 'child_process';
import _treeKill from 'tree-kill';
import { promisify } from 'util';
import {
  walkParentDirs,
  type StartDevServer,
  type StartDevServerOptions,
} from '@vercel/build-utils';
import { isErrnoException } from '@vercel/error-utils';
import { getConfig } from '@vercel/static-config';
import { Project } from 'ts-morph';
import {
  forkDevServer,
  readMessage as readDevServerMessage,
} from './fork-dev-server';
import { fixConfig } from './typescript';
import { getRegExpFromMatchers } from './utils';

const require_ = createRequire(__filename);
const treeKill = promisify(_treeKill);

type TypescriptModule = typeof import('typescript');

export const startDevServer: StartDevServer = async opts => {
  const { entrypoint, workPath, config, meta = {}, publicDir } = opts;
  const entrypointPath = join(workPath, entrypoint);

  if (config.middleware === true && typeof meta.requestUrl === 'string') {
    // TODO: static config is also parsed in `dev-server.ts`.
    // we should pass in this version as an env var instead.
    const project = new Project();
    const staticConfig = getConfig(project, entrypointPath);

    // Middleware is a catch-all for all paths unless a `matcher` property is defined
    const matchers = new RegExp(getRegExpFromMatchers(staticConfig?.matcher));

    const parsed = url.parse(meta.requestUrl, true);
    if (
      typeof parsed.pathname !== 'string' ||
      !matchers.test(parsed.pathname)
    ) {
      // If the "matchers" doesn't say to handle this
      // path then skip middleware invocation
      return null;
    }
  }

  const entryDir = dirname(entrypointPath);
  const ext = extname(entrypoint);

  const pathToTsConfig = await walkParentDirs({
    base: workPath,
    start: entryDir,
    filename: 'tsconfig.json',
  });
  const pathToPkg = await walkParentDirs({
    base: workPath,
    start: entryDir,
    filename: 'package.json',
  });
  const pkg = pathToPkg ? require_(pathToPkg) : {};
  const isTypeScript = ['.ts', '.tsx', '.mts', '.cts'].includes(ext);
  const maybeTranspile = isTypeScript || !['.cjs', '.mjs'].includes(ext);
  const isEsm =
    ext === '.mjs' ||
    ext === '.mts' ||
    (pkg.type === 'module' && ['.js', '.ts', '.tsx'].includes(ext));

  let tsConfig: any = {};

  if (maybeTranspile) {
    const resolveTypescript = (p: string): string => {
      try {
        return require_.resolve('typescript', {
          paths: [p],
        });
      } catch (_) {
        return '';
      }
    };

    const requireTypescript = (p: string): TypescriptModule => require_(p);

    let ts: TypescriptModule | null = null;

    // Use the project's version of Typescript if available and supports `target`
    let compiler = resolveTypescript(process.cwd());
    if (compiler) {
      ts = requireTypescript(compiler);
    }

    // Otherwise fall back to using the copy that `@vercel/node` uses
    if (!ts) {
      compiler = resolveTypescript(join(__dirname, '..'));
      ts = requireTypescript(compiler);
    }

    if (pathToTsConfig) {
      try {
        tsConfig = ts.readConfigFile(pathToTsConfig, ts.sys.readFile).config;
      } catch (error: unknown) {
        if (isErrnoException(error) && error.code !== 'ENOENT') {
          console.error(`Error while parsing "${pathToTsConfig}"`);
          throw error;
        }
      }
    }

    // if we're using ESM, we need to tell TypeScript to use `nodenext` to
    // preserve the `import` semantics
    if (isEsm) {
      if (!tsConfig.compilerOptions) {
        tsConfig.compilerOptions = {};
      }
      if (tsConfig.compilerOptions.module === undefined) {
        tsConfig.compilerOptions.module = 'nodenext';
      }
      if (tsConfig.compilerOptions.moduleResolution === undefined) {
        tsConfig.compilerOptions.moduleResolution = 'nodenext';
      }
    }

    const nodeVersionMajor = Number(process.versions.node.split('.')[0]);
    fixConfig(tsConfig, nodeVersionMajor);

    // In prod, `.ts` inputs use TypeScript and
    // `.js` inputs use Babel to convert ESM to CJS.
    // In dev, both `.ts` and `.js` inputs use ts-node
    // without Babel so we must enable `allowJs`.
    tsConfig.compilerOptions.allowJs = true;

    // In prod, we emit outputs to the filesystem.
    // In dev, we don't emit because we use ts-node.
    tsConfig.compilerOptions.noEmit = true;
  }

  const child = forkDevServer({
    workPath,
    config,
    entrypoint,
    require_,
    isEsm,
    isTypeScript,
    maybeTranspile,
    meta,
    tsConfig,
    publicDir,
  });

  const { pid } = child;
  const message = await readDevServerMessage(child);

  if (message.state === 'message') {
    // "message" event
    if (isTypeScript) {
      // Invoke `tsc --noEmit` asynchronously in the background, so
      // that the HTTP request is not blocked by the type checking.
      doTypeCheck(opts, pathToTsConfig).catch((err: Error) => {
        console.error('Type check for %j failed:', entrypoint, err);
      });
    }

    // An optional callback for graceful shutdown.
    const shutdown = async () => {
      // Send a "shutdown" message to the child process. Ideally we'd use a signal
      // (SIGTERM) here, but that doesn't work on Windows. This is a portable way
      // to tell the child process to exit gracefully.
      child.send('shutdown', async err => {
        if (err) {
          // The process might have already exited, for example, if the application
          // handler threw an error. Try terminating the process to be sure.
          await treeKill(pid);
        }
      });
    };

    return { port: message.value.port, pid, shutdown };
  } else {
    // Got "exit" event from child process
    const [exitCode, signal] = message.value;
    const reason = signal ? `"${signal}" signal` : `exit code ${exitCode}`;
    throw new Error(`Function \`${entrypoint}\` failed with ${reason}`);
  }
};

async function doTypeCheck(
  { entrypoint, workPath, meta = {} }: StartDevServerOptions,
  projectTsConfig: string | null
): Promise<void> {
  const { devCacheDir = join(workPath, '.vercel', 'cache') } = meta;
  const entrypointCacheDir = join(devCacheDir, 'node', entrypoint);

  // Resolve TypeScript compiler path using the same logic as typescript.ts
  const resolveTypescript = (p: string): string => {
    try {
      return require_.resolve('typescript', {
        paths: [p],
      });
    } catch (_) {
      return '';
    }
  };

  // Use the project's version of TypeScript if available
  let compiler = resolveTypescript(workPath);
  if (!compiler) {
    // Otherwise fall back to using the copy that `@vercel/node` uses
    compiler = resolveTypescript(join(__dirname, '..'));
  }
  if (!compiler) {
    // Final fallback to global typescript
    compiler = require_.resolve('typescript');
  }

  const tscPath = resolve(dirname(compiler), '../bin/tsc');

  // In order to type-check a single file, a standalone tsconfig
  // file needs to be created that inherits from the base one :(
  // See: https://stackoverflow.com/a/44748041/376773
  //
  // A different filename needs to be used for different `extends` tsconfig.json
  const tsconfigName = projectTsConfig
    ? `tsconfig-with-${relative(workPath, projectTsConfig).replace(
        /[\\/.]/g,
        '-'
      )}.json`
    : 'tsconfig.json';
  const tsconfigPath = join(entrypointCacheDir, tsconfigName);
  const tsconfig = {
    extends: projectTsConfig
      ? relative(entrypointCacheDir, projectTsConfig)
      : undefined,
    include: [relative(entrypointCacheDir, join(workPath, entrypoint))],
  };

  try {
    const json = JSON.stringify(tsconfig, null, '\t');
    await fsp.mkdir(entrypointCacheDir, { recursive: true });
    await fsp.writeFile(tsconfigPath, json, { flag: 'wx' });
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code !== 'EEXIST') throw error;
  }

  const child = spawn(
    process.execPath,
    [
      tscPath,
      '--project',
      tsconfigPath,
      '--noEmit',
      '--allowJs',
      '--esModuleInterop',
      '--skipLibCheck',
    ],
    {
      cwd: workPath,
      stdio: 'inherit',
    }
  );
  await once.spread<[number, string | null]>(child, 'close');
}
