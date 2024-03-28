#!/usr/bin/env node

import fetch from 'node-fetch';
import { Listr } from 'listr2';
import fs from 'fs-extra';
import path from 'node:path';
import { pipeline } from 'node:stream';
import { promisify } from 'node:util';
import { spawn } from 'node:child_process';
import tar from 'tar';

function showHelp() {
  console.error(`USAGE: npm-bulk-download <output-dir> [packages...]`);
  console.error('or     cat <file> | npm-bulk-download <output-dir>');
  process.exit(1);
}

if (
  process.argv.length < 3 ||
  (process.argv.length < 4 && process.stdin.isTTY) ||
  process.argv.includes('-h') ||
  process.argv.includes('--help')
) {
  showHelp();
}

const streamPipeline = promisify(pipeline);
const [, , outputDir, ...list] = process.argv;

if (!list.length) {
  await new Promise(resolve => {
    const timeout = setTimeout(() => showHelp(), 500);
    process.stdin
      .setEncoding('utf8')
      .on('readable', () => {
        clearTimeout(timeout);
        const chunk = process.stdin.read();
        if (chunk !== null) {
          list.push(...chunk.toString().split(/\r\n|\n/));
        }
      })
      .on('end', () => resolve());
  });
}

if (fs.existsSync(outputDir)) {
  console.error(`Destination already exists "${outputDir}"`);
  process.exit(1);
}

const tasks = Array.from(
  new Set(list.map(line => line.trim()).filter(Boolean))
).map(pkg => ({
  title: pkg,
  task: async (ctx, task) => {
    try {
      await download(pkg);
      task.title += ' Succeeded';
    } catch (err) {
      task.title += ` Failed: ${err}`;
    }
  },
}));

console.log(
  `Processing ${tasks.length} pacakge${tasks.length === 1 ? '' : 's'}`
);

const startTime = Date.now();

await new Listr(tasks, {
  concurrent: 10,
}).run();

console.log(`Finished in ${(Date.now() - startTime) / 1000} seconds`);

async function download(url) {
  try {
    new URL(url);
  } catch (e) {
    // not a url
    url = await new Promise((resolve, reject) => {
      const child = spawn('npm', ['view', url, '--json', 'dist.tarball']);
      let buffer = '';
      child.stdout.on('data', data => (buffer += data.toString()));
      child.on('error', reject);
      child.on('close', code => {
        if (code) {
          reject(new Error(`npm view "${url}" failed (code ${code})`));
        } else {
          resolve(JSON.parse(buffer));
        }
      });
    });
  }

  const { base: filename, name } = path.parse(new URL(url).pathname);
  const tarball = path.join(outputDir, filename);
  const extractDir = path.join(
    outputDir,
    `tmp-${name}-${Math.floor(Math.random() * 1e5)}`
  );

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }

    await fs.mkdirs(extractDir);
    await streamPipeline(response.body, fs.createWriteStream(tarball));

    await tar.extract({
      cwd: extractDir,
      file: tarball,
    });

    const src = path.join(extractDir, 'package');
    const pkgJson = await fs.readJSON(path.join(src, 'package.json'));
    const pkgDir = path.join(outputDir, pkgJson.name);
    const dest = path.join(pkgDir, pkgJson.version);
    await fs.mkdirs(pkgDir);
    await fs.move(src, dest);
  } finally {
    try {
      await Promise.all([fs.remove(extractDir), fs.remove(tarball)]);
    } catch (e) {
      // silence
    }
  }
}
