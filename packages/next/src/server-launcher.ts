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

async function eagerLoadDependencies(rootDir: string) {
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
  return Promise.allSettled(promises).then(() => void 0);
}

async function extractDependencies(filePath: string): Promise<void> {
  const promises = [] as Promise<unknown>[];
  const contents = await fs.readFile(filePath, 'utf8');
  const matches = contents.matchAll(/\b(require|import)\("(.+?)"\)\b/g);
  for (const match of matches) {
    if (!match[2] || match[2].startsWith('.')) {
      logs.push(`[${filePath}] skip dependency ${match[1]}`);
      continue;
    }

    promises.push(import(match[1]));
  }
  return Promise.allSettled(promises).then(() => void 0);
}

const logs = [] as string[];

const before = Date.now();
const deps$ = eagerLoadDependencies('./.next/server/pages');

module.exports = (async () => {
  await deps$;
  const after = Date.now();
  logs.push(`[compute] eager load dependencies took ${after - before}ms`);

  return async (req: IncomingMessage, res: ServerResponse) => {
    for (const log of logs) {
      console.log(log);
    }
    logs.length = 0;

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
