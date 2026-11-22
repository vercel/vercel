// Credential-free end-to-end probe for native config compilation.
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const binary = resolve(process.argv[2] || 'dist-bin/vercel');
const virtualRoot = '/snapshot/vercel-cli-binary-staging';
const home = await mkdtemp(join(tmpdir(), 'vercel-binary-config-'));

try {
  const project = join(home, 'project');
  await mkdir(project);
  await writeFile(
    join(project, 'vercel.ts'),
    `const value: string = 'compiled';
export default {
  headers: [{ source: '/(.*)', headers: [{ key: 'X-Binary-Config', value }] }],
};`
  );

  const builder = join(home, 'config-probe.cjs');
  await writeFile(
    builder,
    `exports.version = 2;
exports.build = async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { pathToFileURL } = require('node:url');
  const chunks = ${JSON.stringify(`${virtualRoot}/dist/chunks`)};
  const compiler = fs.readdirSync(chunks).find(name =>
    name.startsWith('compile-vercel-config-') && name.endsWith('.js')
  );
  if (!compiler) throw new Error('Missing config compiler chunk');
  const { compileVercelConfig } = await import(
    pathToFileURL(path.join(chunks, compiler)).href
  );
  const result = await compileVercelConfig(${JSON.stringify(project)});
  return {
    output: {},
    routes: [],
    config: JSON.parse(fs.readFileSync(result.configPath, 'utf8')),
  };
};`
  );

  const result = await probeBuildWorker(builder);
  assert.equal(result.config.headers[0].headers[0].value, 'compiled');
  const cacheEntries = await readFile(
    join(project, '.vercel/vercel.json'),
    'utf8'
  );
  assert.match(cacheEntries, /compiled/);
  console.log('PASS native TypeScript config compilation');
} finally {
  await rm(home, { recursive: true, force: true });
}

function probeBuildWorker(builder) {
  return new Promise((resolveResult, reject) => {
    const child = fork(
      `${virtualRoot}/dist/commands/build/builder-worker.cjs`,
      [],
      {
        execPath: binary,
        execArgv: [],
        cwd: home,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        serialization: 'advanced',
        env: {
          ...process.env,
          HOME: home,
          XDG_CACHE_HOME: join(home, 'cache'),
          VERCEL_TELEMETRY_DISABLED: '1',
        },
      }
    );
    let output = '';
    let result;
    let error;
    child.stdout.on('data', chunk => (output += chunk));
    child.stderr.on('data', chunk => (output += chunk));
    const timer = setTimeout(() => {
      error = new Error(`Worker timed out: ${output}`);
      child.kill('SIGKILL');
    }, 30_000);
    child.on('error', err => {
      error = err;
    });
    child.on('message', message => {
      if (message.type === 'ready') {
        child.send({
          type: 'build',
          requirePath: builder,
          buildOptions: {
            files: {},
            entrypoint: 'index.js',
            workPath: home,
            config: {},
            meta: {},
          },
        });
      } else if (message.type === 'buildResult') {
        if (message.error) error = new Error(JSON.stringify(message.error));
        else result = message.result;
        child.kill();
      }
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (error) reject(new Error(`${error.message}\n${output}`));
      else if (!result) {
        reject(new Error(`Worker exited ${code} without a result: ${output}`));
      } else {
        resolveResult(result);
      }
    });
  });
}
