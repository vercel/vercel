import { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs/promises';

// The Next.js builder can emit the project in a subdirectory depending on how
// many folder levels of `node_modules` are traced. To ensure `process.cwd()`
// returns the proper path, we change the directory to the folder with the
// launcher. This mimics `yarn workspace run` behavior.
process.chdir(__dirname);

const region = process.env.VERCEL_REGION || process.env.NOW_REGION;

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = region === 'dev1' ? 'development' : 'production';
}

if (process.env.NODE_ENV !== 'production' && region !== 'dev1') {
  console.warn(
    `Warning: NODE_ENV was incorrectly set to "${process.env.NODE_ENV}", this value is being overridden to "production"`
  );
  process.env.NODE_ENV = 'production';
}

// pre-next-server-target

// eslint-disable-next-line
const NextServer = require('__NEXT_SERVER_PATH__').default;
const nextServer = new NextServer({
  // @ts-ignore __NEXT_CONFIG__ value is injected
  conf: __NEXT_CONFIG__,
  dir: '.',
  minimalMode: true,
  customServer: false,
});

const requestHandler = nextServer.getRequestHandler();

const logs = [] as string[];
async function eagerLoadDependencies(rootDir: string) {
  logs.push(`[${rootDir}] traversing...`);
  const files = await fs.readdir(rootDir);
  const promises = [] as Promise<void>[];
  for (const file of files) {
    const filePath = `${rootDir}/${file}`;
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      promises.push(eagerLoadDependencies(filePath));
    } else if (file.endsWith('.js')) {
      logs.push('[compute] load dependency', filePath);
      promises.push(extractDependencies(filePath));
    }
  }
  logs.push(`[${rootDir}] ${promises.length} promises`);
  return Promise.allSettled(promises).then(() => void 0);
}

const dynImport = eval('x => import(x)');

async function extractDependencies(filePath: string): Promise<void> {
  logs.push(`[${filePath}] extracting`);
  const promises = [] as Promise<unknown>[];
  const contents = await fs.readFile(filePath, 'utf8');
  const matches = contents.matchAll(/\b(require|import)\("(.+?)"\)/g);
  let i = 0;
  for (const match of matches) {
    i++;
    const [, importType, depName] = match;
    if (!depName || depName.startsWith('.')) {
      logs.push(`[${filePath}] skip dependency ${depName}`);
      continue;
    }

    const time = Date.now();
    promises.push(
      dynImport(depName).finally(() => {
        logs.push(
          `[${filePath}] ${importType} dependency ${depName} in ${
            Date.now() - time
          }ms`
        );
      })
    );
  }
  logs.push(`[${filePath}] ${promises.length} deps, ${i} matches`);
  return Promise.allSettled(promises).then(() => void 0);
}

const before = Date.now();
const deps$ = eagerLoadDependencies('./.next/server/pages');

module.exports = (async () => {
  await deps$.catch(() => {
    logs.push('[compute] eager load dependencies failed');
  });
  const after = Date.now();

  return async (req: IncomingMessage, res: ServerResponse) => {
    setTimeout(() => {
      console.log(`[compute] eager load dependencies took ${after - before}ms`);
      console.log(`[compute] logs: ${logs.length} lines`);
      for (const log of logs) {
        console.log(log);
      }
    }, 10);

    try {
      // entryDirectory handler
      await requestHandler(req, res);
    } catch (err) {
      console.error(err);
      // crash the lambda immediately to clean up any bad module state,
      // this was previously handled in ___vc_bridge on an unhandled rejection
      // but we can do this quicker by triggering here
      process.exit(1);
    }
  };
})();
