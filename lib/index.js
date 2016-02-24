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
    hashes.forEach((val, key) => {
      console.log(`> [debug] Found "${key}" [${val}]`);
    });
  }

  const agent = new Agent('www.google.com');
  if (debug) console.time('> [debug] http');
  const res = await agent.fetch('/now/create');
  if (debug) console.timeEnd('> [debug] http');
  console.log(res.status);
  agent.close();

  return 'https://test.now.run';
}
