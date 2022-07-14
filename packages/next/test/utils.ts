import type { Context, LoggerServer, Dictionary } from './types';
import type { IncomingMessage } from 'http';

import {
  packAndDeploy,
  testDeployment,
} from '../../../test/lib/deployment/test-deployment';
import { fetchTokenWithRetry } from '../../../test/lib/deployment/now-deploy';

import fs from 'fs-extra';
import http from 'http';
import listen from 'test-listen';
import ms from 'ms';
import ndjson from 'ndjson';
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

export const composeRoute = (route, { host = 'example.vercel.sh' } = {}) =>
  `http://localhost:1337/workerId/GET/https/${host}/${route.replace('/', '')}`;

export const createLoggerServer = async (): Promise<LoggerServer> => {
  const content: Dictionary[] = [];

  const server = http.createServer((req, res) => {
    req
      .pipe(ndjson.parse())
      .on('data', json => content.push(json))
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

let builderUrlPromise;
let builderUrlLastUpdated = 0;
const buildUtilsUrl = '@canary';

process.env.NEXT_TELEMETRY_DISABLED = '1';

export async function deployAndTest(fixtureDir) {
  let builderInfo;
  const builderInfoPath = path.join(__dirname, 'builder-info.json');

  try {
    builderInfo = await fs.readJSON(builderInfoPath);
  } catch (_) {
    /**/
  }
  let tempToken;

  if (!builderUrlPromise && builderInfo) {
    builderUrlPromise = Promise.resolve(builderInfo.builderUrl);
    builderUrlLastUpdated = builderInfo.lastUpdated;
    tempToken = builderInfo.tempToken;
  }
  const builderUrlIsStale = builderUrlLastUpdated < Date.now() - ms('25min');

  if (!process.env.VERCEL_TOKEN && (builderUrlIsStale || !tempToken)) {
    tempToken = await fetchTokenWithRetry();
  }
  process.env.TEMP_TOKEN = tempToken;

  if (builderUrlIsStale) {
    const builderPath = path.resolve(__dirname, '..');
    builderUrlPromise = packAndDeploy(builderPath, false);
    builderUrlLastUpdated = Date.now();
  }

  const builderUrl = await builderUrlPromise;

  await fs.writeFile(
    builderInfoPath,
    JSON.stringify({
      tempToken,
      builderUrl,
      lastUpdated: builderUrlLastUpdated,
    })
  );

  const { deploymentId, deploymentUrl } = await testDeployment(
    { builderUrl, buildUtilsUrl },
    fixtureDir
  );

  return {
    deploymentId,
    deploymentUrl: `https://${deploymentUrl}`,
  };
}

export async function waitFor(milliseconds) {
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
