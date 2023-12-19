import type { Context, LoggerServer, Dictionary } from './types';
import type { IncomingMessage } from 'http';

import { testDeployment } from '../../../test/lib/deployment/test-deployment';

import fs from 'fs-extra';
import http from 'http';
import listen from 'test-listen';
import ms from 'ms';
import ndjson from 'ndjson';
import os from 'os';
import path from 'path';

jest.setTimeout(ms('6m'));

export function toHeaders(headers: IncomingMessage['headers'] = {}) {
  const obj: Dictionary<string> = {};
  for (const [key, value] of Object.entries(headers)) {
    obj[key] = Array.isArray(value) ? value.join(',') : value;
  }
  return obj;
}

export async function duplicateWithConfig(params: {
  context: Context;
  path: string;
  suffix: string;
}) {
  const projectPath = `${params.path}-${params.suffix}`;
  if (await fs.pathExists(projectPath)) {
    await fs.remove(projectPath);
  }

  await fs.copy(params.path, projectPath);
  await fs.writeFile(
    path.resolve(projectPath, 'next.config.js'),
    `module.exports = ${JSON.stringify(params.context)}`
  );

  return projectPath;
}

export const composeRoute = (
  route: string,
  { host = 'example.vercel.sh' } = {}
) =>
  `http://localhost:1337/workerId/GET/https/${host}/${route.replace('/', '')}`;

export const createLoggerServer = async (): Promise<LoggerServer> => {
  const content: Dictionary[] = [];

  const server = http.createServer((req, res) => {
    req
      .pipe(ndjson.parse())
      .on('data', (json: Dictionary) => content.push(json))
      .on('end', () => res.end());
  });

  const url: string = await listen(server);

  function close() {
    return new Promise<void>((resolve, reject) => {
      server.close(err => {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });
  }

  return { url, close, content };
};

process.env.NEXT_TELEMETRY_DISABLED = '1';

export async function deployAndTest(fixtureDir: string, opts) {
  const { deploymentId, deploymentUrl } = await testDeployment(
    fixtureDir,
    opts
  );

  return {
    deploymentId,
    deploymentUrl: `https://${deploymentUrl}`,
  };
}

export async function waitFor(milliseconds: number) {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}

export async function check(contentFn, regex, hardError = true) {
  let content;
  let lastErr;

  for (let tries = 0; tries < 30; tries++) {
    try {
      content = await contentFn();
      if (typeof regex === 'string') {
        if (regex === content) {
          return true;
        }
      } else if (regex.test(content)) {
        // found the content
        return true;
      }
      await waitFor(1000);
    } catch (err) {
      await waitFor(1000);
      lastErr = err;
    }
  }
  console.error('TIMED OUT CHECK: ', { regex, content, lastErr });

  if (hardError) {
    throw new Error('TIMED OUT: ' + regex + '\n\n' + content);
  }
  return false;
}

export async function genDir(structure: { [path: string]: string }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'next-test-'));
  for (const [p, content] of Object.entries(structure)) {
    const p2 = path.join(dir, p);
    await fs.mkdirp(path.dirname(p2));
    await fs.writeFile(p2, content);
  }
  return dir;
}
