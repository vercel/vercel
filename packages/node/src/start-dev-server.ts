import url from 'url';
import { createRequire } from 'module';
import { promises as fsp } from 'fs';
import { join, dirname, extname } from 'path';
import _treeKill from 'tree-kill';
import { promisify } from 'util';
import {
  BunVersion,
  walkParentDirs,
  getSupportedBunVersion,
  type StartDevServer,
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

  const project = new Project();
  const staticConfig = getConfig(project, entrypointPath);
  const vercelConfigFile = opts.files['vercel.json'];
  let bunVersion: BunVersion | undefined;
  try {
    if (vercelConfigFile?.type === 'FileFsRef') {
      const vercelConfigContents = await fsp.readFile(
        vercelConfigFile.fsPath,
        'utf8'
      );
      if (vercelConfigContents) {
        try {
          const vercelConfig = JSON.parse(vercelConfigContents);
          if (vercelConfig.bunVersion) {
            bunVersion = getSupportedBunVersion(vercelConfig.bunVersion);
          }
        } catch {
          // Ignore
        }
      }
    }
  } catch {
    // Ignore
  }
  const runtime = bunVersion ? 'bun' : 'node';

  if (config.middleware === true && typeof meta.requestUrl === 'string') {
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

  const child = await forkDevServer({
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
    runtime,
  });

  const { pid } = child;
  const message = await readDevServerMessage(child);

  if (message.state === 'message') {
    // "message" event
    if (isTypeScript) {
      // Invoke `tsc --noEmit` asynchronously in the background, so
      // that the HTTP request is not blocked by the type checking.
    }

    if (!pid) {
      throw new Error(`Child process exited`);
    }

    // An optional callback for graceful shutdown.
    const shutdown = async () => {
      // Send a "shutdown" message to the child process. Ideally we'd use a signal
      // (SIGTERM) here, but that doesn't work on Windows. This is a portable way
      // to tell the child process to exit gracefully.
      if (runtime === 'bun') {
        try {
          process.kill(pid, 'SIGTERM');
        } catch (err) {
          // The process might have already exited, for example, if the application
          // handler threw an error. Try terminating the process to be sure.
          await treeKill(pid);
        }
      } else {
        // For Node.js runtime using fork(), use IPC
        await new Promise<void>((resolve, reject) => {
          child.send('shutdown', err => {
            if (err) {
              // The process might have already exited, for example, if the application
              // handler threw an error. Try terminating the process to be sure.
              treeKill(pid)
                .then(() => resolve())
                .catch(killErr => reject(killErr));
            } else {
              resolve();
            }
          });
        });
      }
    };

    return { port: message.value.port, pid, shutdown };
  } else {
    // Got "exit" event from child process
    const [exitCode, signal] = message.value;
    const reason = signal ? `"${signal}" signal` : `exit code ${exitCode}`;
    throw new Error(`Function \`${entrypoint}\` failed with ${reason}`);
  }
};
