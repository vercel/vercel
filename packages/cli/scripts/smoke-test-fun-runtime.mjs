import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Run a function the way third-party runtimes such as vercel-php do in
// `vercel dev`: a Builder without `startDevServer` returns a Lambda for the
// `provided` runtime, and @vercel/fun starts its `bootstrap` through the
// launcher it copies into its cache. The fun cache starts empty so the
// launcher has to come from the CLI under test.
const packageRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
const binArg = process.argv[2] ?? 'dist-bin/vercel';
const binPath = isAbsolute(binArg) ? binArg : join(packageRoot, binArg);
const require = createRequire(import.meta.url);
const { FileBlob, Lambda } = require('@vercel/build-utils');

const TIMEOUT_MS = 180_000;
const BUILDER_NAME = 'smoke-provided-builder';

const BUILDER = `
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

exports.version = 3;
exports.build = async () => ({
  output: {
    type: 'Lambda',
    handler: 'bootstrap',
    runtime: 'provided',
    createZip: async () => readFileSync(join(__dirname, 'lambda.zip')),
  },
});
`;

// Stands in for the PHP binary: a Lambda Runtime API loop that answers each
// invocation with the request path.
const BOOTSTRAP = `#!/usr/bin/env node
const http = require('node:http');
const api = 'http://' + process.env.AWS_LAMBDA_RUNTIME_API + '/2018-06-01/runtime/invocation';
function request(method, url, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => (data += chunk));
      res.on('end', () => resolve({ headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.end(body);
  });
}
(async () => {
  for (;;) {
    const next = await request('GET', api + '/next');
    const id = next.headers['lambda-runtime-aws-request-id'];
    const { path } = JSON.parse(JSON.parse(next.body).body);
    await request('POST', api + '/' + id + '/response', JSON.stringify({
      statusCode: 200,
      headers: { 'content-type': 'text/plain' },
      body: 'provided runtime served ' + path,
    }));
  }
})();
`;

function fail(message, log) {
  console.error(`fun runtime smoke test FAILED: ${message}`);
  if (log) {
    console.error(
      log
        .trim()
        .split('\n')
        .slice(-40)
        .map(line => `  | ${line}`)
        .join('\n')
    );
  }
  process.exit(1);
}

function killGroup(child) {
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    // The group has already exited.
  }
  child.stdout.destroy();
  child.stderr.destroy();
}

async function writeProject(projectDir) {
  const builderDir = join(
    projectDir,
    '.vercel',
    'builders',
    'node_modules',
    BUILDER_NAME
  );
  await mkdir(builderDir, { recursive: true });
  await mkdir(join(projectDir, 'api'));
  await writeFile(join(projectDir, 'api', 'index.php'), '<?php echo "hi";');
  await writeFile(
    join(projectDir, 'vercel.json'),
    JSON.stringify({
      builds: [{ src: 'api/index.php', use: BUILDER_NAME }],
    })
  );
  await writeFile(
    join(builderDir, 'package.json'),
    JSON.stringify({ name: BUILDER_NAME, version: '1.0.0', main: 'index.js' })
  );
  await writeFile(join(builderDir, 'index.js'), BUILDER);
  const lambda = new Lambda({
    files: {
      bootstrap: new FileBlob({ data: BOOTSTRAP, mode: 0o100755 }),
    },
    handler: 'bootstrap',
    runtime: 'provided',
  });
  await writeFile(join(builderDir, 'lambda.zip'), await lambda.createZip());
}

async function main() {
  if (process.platform === 'win32') {
    console.log(
      'fun runtime smoke test skipped: fun runs `bootstrap` on Unix.'
    );
    return;
  }
  console.log(`fun runtime smoke testing: ${binPath}\n`);

  const root = await mkdtemp(join(tmpdir(), 'vc-fun-smoke-'));
  let child;
  try {
    const projectDir = join(root, 'project');
    await writeProject(projectDir);

    // Its own process group, so the function processes fun starts are
    // killed with it and do not hold the output pipes open.
    child = spawn(binPath, ['dev', '--local', '--listen', '0'], {
      cwd: projectDir,
      detached: true,
      env: {
        HOME: root,
        XDG_CACHE_HOME: join(root, 'cache'),
        PATH: process.env.PATH ?? '',
        NO_UPDATE_NOTIFIER: '1',
        VERCEL_TELEMETRY_DISABLED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    const timer = setTimeout(() => {
      killGroup(child);
      fail(`timed out after ${TIMEOUT_MS / 1000}s`, log);
    }, TIMEOUT_MS);

    const url = await new Promise((resolveUrl, reject) => {
      const onData = chunk => {
        log += chunk;
        const match = /Ready! Available at (http:\/\/\S+)/.exec(log);
        if (match) resolveUrl(match[1]);
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      child.once('exit', code =>
        reject(new Error(`vercel dev exited with code ${code}`))
      );
    }).catch(error => fail(error.message, log));

    const res = await fetch(new URL('/api/index.php', url)).catch(error =>
      fail(`request failed: ${error.cause?.message ?? error.message}`, log)
    );
    const body = await res.text();
    clearTimeout(timer);
    if (
      res.status !== 200 ||
      body !== 'provided runtime served /api/index.php'
    ) {
      fail(`expected the function's response, got ${res.status}: ${body}`, log);
    }
    console.log(
      'fun runtime smoke test PASSED: the provided runtime served the request.'
    );
  } finally {
    if (child) killGroup(child);
    await rm(root, { force: true, recursive: true });
  }
}

main().catch(error => fail(`harness crashed: ${error?.stack ?? error}`));
