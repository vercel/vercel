import fs from 'fs-promise';
import getFiles from './get-files';
import hash from './hash';
import Agent from './Agent';
import { resolve } from 'path';

export default async function now (path, token, { debug }) {
  try {
    await fs.stat(path);
  } catch (err) {
    throw new Error(`Could not read directory ${path}.`);
  }

  let pkg;
  try {
    pkg = await fs.readFile(resolve(path, 'package.json'));
    pkg = JSON.parse(pkg);
  } catch (err) {
    throw new Error(`Failed to read JSON in "${path}/package.json"`);
  }

  if (debug) console.time('> [debug] Getting files');
  const files = await getFiles(path, pkg);
  if (debug) console.timeEnd('> [debug] Getting files');

  if (debug) console.time('> [debug] Computing hashes');
  const hashes = await hash(files);
  if (debug) console.timeEnd('> [debug] Computing hashes');

  if (debug) {
    hashes.forEach((sha, file) => {
      console.log(`> [debug] Found "${file}" [${sha}]`);
    });
  }

  const agent = new Agent('zeit.co');
  const fetch = async (url, opts) => {
    opts.headers = opts.headers || {};
    opts.headers.authorization = `Bearer ${token}`;
    const res = await agent.fetch(url, opts);
    if (403 === res.status) {
      const err = new Error('Authorization failed.');
      err.status = 403;
      throw err;
    } else if (500 === res.status) {
      const err = new Error('Server error.');
      err.status = 500;
      throw err;
    } else {
      return res;
    }
  };

  if (debug) console.time('> [debug] http');
  const res = await fetch('/now/create', {
    method: 'POST',
    body: {
      shas: hashes.keys()
    }
  });

  if (200 !== res.status) {
    throw new Error('Deployment initialization failed');
  }

  if (debug) console.timeEnd('> [debug] http');
  console.log(res.status);
  agent.close();

  return 'https://test.now.run';
}
