import { spawn } from 'node:child_process';
import { brotliDecompressSync } from 'node:zlib';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { signalProcessTree } from './smoke-test-binary.mjs';

// Run `vercel build` through a native binary the way CI users do: a fresh
// HOME, the default Builder cache location, and Builders downloaded from npm
// on first use. Covers cold and warm caches, concurrent builds sharing a
// cache, and offline builds from `vercel builders preinstall`.

const packageRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
const repoRoot = resolve(packageRoot, '../..');
const NPM_REGISTRY = 'https://registry.npmjs.org';
const BUILD_TIMEOUT_MS = 10 * 60 * 1000;

const FIXTURES = {
  node: {
    builder: '@vercel/node',
    files: {
      'api/hello.js':
        'module.exports = (req, res) => { res.end("native node ok"); };\n',
      'api/edge.js':
        'export const config = { runtime: "edge" };\nexport default () => new Response("native edge ok");\n',
      'middleware.js':
        'export default () => new Response("native middleware ok");\nexport const config = { matcher: "/protected" };\n',
    },
    functions: {
      'api/hello': /^nodejs/,
      'api/edge': /^edge$/,
      middleware: /^edge$/,
    },
  },
  'static-build': {
    builder: '@vercel/static-build',
    files: {
      'package.json': `${JSON.stringify({
        name: 'native-static-build',
        private: true,
        scripts: { build: 'node build.mjs' },
      })}\n`,
      'build.mjs':
        "import { mkdir, writeFile } from 'node:fs/promises';\nawait mkdir('public', { recursive: true });\nawait writeFile('public/index.txt', 'native static-build ok\\n');\n",
    },
    outputs: ['static/index.txt'],
  },
  backends: {
    builder: '@vercel/backends',
    framework: 'node',
    files: {
      'package.json': `${JSON.stringify({
        name: 'native-backends',
        private: true,
        type: 'module',
      })}\n`,
      'server.ts':
        "import { createServer } from 'node:http';\nconst message: string = 'native backends ok';\ncreateServer((req, res) => res.end(message)).listen(Number(process.env.PORT ?? 3000));\n",
    },
    functions: { index: /^nodejs/ },
  },
  python: {
    builder: '@vercel/python',
    files: {
      // Without a pin the Builder uses the runner's default Python, which
      // can be older than the 3.12 that vercel-runtime requires.
      '.python-version': '3.12\n',
      'api/hello.py':
        'from http.server import BaseHTTPRequestHandler\n\nclass handler(BaseHTTPRequestHandler):\n    def do_GET(self):\n        self.send_response(200)\n        self.end_headers()\n        self.wfile.write(b"native python ok")\n',
    },
    functions: { 'api/hello': /^python/ },
  },
  go: {
    builder: '@vercel/go',
    files: {
      'go.mod': 'module native-builders-go\n\ngo 1.23\n',
      'api/hello.go':
        'package handler\n\nimport (\n\t"fmt"\n\t"net/http"\n)\n\nfunc Handler(w http.ResponseWriter, r *http.Request) {\n\tfmt.Fprint(w, "native go ok")\n}\n',
    },
    functions: { 'api/hello': /^provided\./ },
  },
};

const SCENARIOS = ['cold', 'warm', 'concurrent', 'offline'];

const { values } = parseArgs({
  options: {
    binary: { type: 'string' },
    fixtures: { type: 'string', default: Object.keys(FIXTURES).join(',') },
    scenarios: { type: 'string', default: SCENARIOS.join(',') },
    'require-all': { type: 'boolean', default: false },
    work: { type: 'string' },
  },
});
if (!values.binary) {
  throw new Error(
    'Usage: test-native-builders.mjs --binary <path> [--fixtures node,...] [--scenarios cold,...] [--require-all] [--work <dir>]'
  );
}
const binary = isAbsolute(values.binary)
  ? values.binary
  : resolve(process.cwd(), values.binary);
const fixtureNames = parseList(values.fixtures, Object.keys(FIXTURES));
const scenarios = new Set(parseList(values.scenarios, SCENARIOS));

function parseList(list, allowed) {
  const items = list
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  for (const item of items) {
    if (!allowed.includes(item)) {
      throw new Error(
        `Unknown value "${item}". Expected ${allowed.join(', ')}.`
      );
    }
  }
  return items;
}

const results = [];

async function main() {
  const workRoot = values.work
    ? resolve(values.work)
    : await mkdtemp(join(tmpdir(), 'vc-native-builders-'));
  await removeTree(workRoot);
  await mkdir(workRoot, { recursive: true });

  const unpublished = await findUnpublishedBuilders(workRoot);
  const runnable = [];
  for (const name of fixtureNames) {
    const { builder } = FIXTURES[name];
    if (unpublished.has(builder)) {
      skip(
        `${name} fixture`,
        `${builder} needs ${unpublished.get(builder).join(', ')}, which are not published yet`
      );
    } else {
      runnable.push(name);
    }
  }
  const nodeRunnable = runnable.includes('node');

  if (scenarios.has('cold') || scenarios.has('warm')) {
    const home = await createHome(workRoot, 'cold');
    for (const name of runnable) {
      const project = await createFixture(workRoot, `cold-${name}`, name);
      if (scenarios.has('cold')) {
        await check(`cold build: ${name}`, async () => {
          const result = await vercelBuild(project, home);
          assertSucceeded(result);
          await assertOutputs(project, name);
          await assertBuilderCached(home, FIXTURES[name].builder);
        });
      }
    }
    if (scenarios.has('warm')) {
      for (const name of runnable) {
        const project = join(workRoot, `cold-${name}`);
        await check(`warm build: ${name}`, async () => {
          if (!scenarios.has('cold')) {
            assertSucceeded(await vercelBuild(project, home));
          }
          const before = await snapshot(await findBuildersCache(home));
          await rm(join(project, '.vercel', 'output'), {
            recursive: true,
            force: true,
          });
          const result = await vercelBuild(project, home);
          assertSucceeded(result);
          await assertOutputs(project, name);
          const after = await snapshot(await findBuildersCache(home));
          if (before !== after) {
            throw new Error('The warm build changed the Builder cache.');
          }
        });
      }
    }
  }

  if (scenarios.has('concurrent')) {
    if (!nodeRunnable) {
      skip('concurrent cold builds', 'the node fixture is not runnable');
    } else {
      await check('4 concurrent cold builds sharing one cache', async () => {
        const home = await createHome(workRoot, 'concurrent');
        const projects = await Promise.all(
          [1, 2, 3, 4].map(i =>
            createFixture(workRoot, `concurrent-${i}`, 'node')
          )
        );
        const builds = await Promise.all(
          projects.map(project => vercelBuild(project, home))
        );
        builds.forEach(assertSucceeded);
        for (const project of projects) await assertOutputs(project, 'node');
        const roots = await findBuilderRoots(home, '@vercel/node');
        if (roots.length !== 1) {
          throw new Error(
            `Expected one @vercel/node installation, found ${roots.length}.`
          );
        }
      });
    }
  }

  if (scenarios.has('offline')) {
    if (!nodeRunnable || unpublished.size > 0) {
      skip(
        'offline build from preinstalled Builders',
        'preinstall needs every pinned Builder on npm'
      );
    } else {
      await check('offline build from preinstalled Builders', async () => {
        const home = await createHome(workRoot, 'offline');
        const buildersDir = join(workRoot, 'preinstalled-builders');
        const preinstall = await runVercel(['builders', 'preinstall'], {
          cwd: workRoot,
          home,
          env: { VERCEL_BUILDERS_DIR: buildersDir },
        });
        assertSucceeded(preinstall);
        const port = await getClosedPort();
        const project = await createFixture(workRoot, 'offline', 'node');
        const result = await vercelBuild(project, home, {
          VERCEL_BUILDERS_DIR: buildersDir,
          ...proxyEnv(port),
        });
        assertSucceeded(result);
        await assertOutputs(project, 'node');
      });
    }
  }

  await printSummary();
  if (!values.work) await removeTree(workRoot);
  if (results.some(result => result.status === 'FAIL')) process.exit(1);
}

/**
 * Builder graphs embedded in a PR or release binary can pin workspace
 * packages that are only published later. Their tarballs 404 until then, so
 * fixtures that depend on them are skipped instead of failing by default.
 * PR preview checks use --require-all to treat any skipped coverage as a failure.
 */
async function findUnpublishedBuilders(workRoot) {
  const ejected = join(workRoot, 'eject');
  const eject = await run(binary, ['--internal-eject', ejected], {
    env: process.env,
  });
  if (eject.code !== 0) {
    throw new Error(`--internal-eject failed:\n${eject.output}`);
  }
  const graphs = JSON.parse(
    brotliDecompressSync(
      await readFile(join(ejected, 'dist', 'builders', 'builder-graph.json.br'))
    ).toString('utf8')
  );
  await rm(ejected, { recursive: true, force: true });

  // Workspace packages resolve to npm in release binaries and to preview
  // tarballs in PR binaries.
  const workspacePackages = await getWorkspacePackageNames();
  const needed = new Map();
  const sources = new Map();
  for (const [builder, graph] of Object.entries(graphs.builders)) {
    const packages = new Set();
    for (const [id, node] of Object.entries(graph.lockfile.nodes)) {
      const name = node[1];
      if (!name || !workspacePackages.has(name)) continue;
      const version = node[5]?.version ?? id.slice(id.lastIndexOf('@') + 1);
      const spec = `${name}@${version}`;
      const tarball = remoteTarballUrl(id);
      if (tarball) sources.set(spec, tarball);
      packages.add(spec);
    }
    needed.set(builder, [...packages]);
  }

  const available = new Map();
  await Promise.all(
    [...new Set([...needed.values()].flat())].map(async spec => {
      available.set(
        spec,
        sources.has(spec)
          ? await isServed(spec, sources.get(spec))
          : await isPublished(spec)
      );
    })
  );
  const unpublished = new Map();
  for (const [builder, packages] of needed) {
    const missing = packages.filter(spec => !available.get(spec));
    if (missing.length > 0) unpublished.set(builder, missing);
  }
  return unpublished;
}

const DEP_ID_UNESCAPES = {
  _: '_',
  p: '+',
  b: '\\',
  c: ':',
  t: '~',
  l: '<',
  g: '>',
  q: '"',
  i: '|',
  m: '?',
  a: '*',
  d: '.',
  s: ' ',
};

// Decodes a vlt `remote~<url>` dep ID, where `/` is written as `+` and other
// reserved characters as `_<letter>`.
function remoteTarballUrl(id) {
  if (!id.startsWith('remote~')) return undefined;
  const encoded = id.slice('remote~'.length).split('~')[0];
  let url = '';
  for (let i = 0; i < encoded.length; i++) {
    const char = encoded[i];
    if (char === '+') {
      url += '/';
    } else if (char === '_' && encoded[i + 1] in DEP_ID_UNESCAPES) {
      url += DEP_ID_UNESCAPES[encoded[++i]];
    } else {
      url += char;
    }
  }
  return url;
}

async function isServed(spec, url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return true;
      if (response.status === 404) return false;
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (attempt === 3) {
        throw new Error(`Could not check ${spec} at ${url}: ${error.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, attempt * 2000));
    }
  }
}

async function getWorkspacePackageNames() {
  const names = new Set();
  for (const dir of ['packages', 'internals']) {
    for (const entry of await readdir(join(repoRoot, dir))) {
      try {
        const manifest = JSON.parse(
          await readFile(join(repoRoot, dir, entry, 'package.json'), 'utf8')
        );
        if (manifest.name) names.add(manifest.name);
      } catch {}
    }
  }
  return names;
}

async function isPublished(spec) {
  const at = spec.lastIndexOf('@');
  const name = spec.slice(0, at);
  const version = spec.slice(at + 1);
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(
        `${NPM_REGISTRY}/${name.replace('/', '%2f')}/${version}`,
        { signal: AbortSignal.timeout(30_000) }
      );
      if (response.status === 200) return true;
      if (response.status === 404) return false;
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (attempt === 3) {
        throw new Error(`Could not check ${spec} on npm: ${error.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, attempt * 2000));
    }
  }
}

// Go makes its module cache read-only.
async function removeTree(path) {
  try {
    await rm(path, { recursive: true, force: true });
  } catch (error) {
    if (error.code !== 'EACCES' && error.code !== 'EPERM') throw error;
    await run('chmod', ['-R', 'u+w', path], { env: process.env });
    await rm(path, { recursive: true, force: true });
  }
}

async function createHome(workRoot, name) {
  const home = join(workRoot, 'homes', name);
  await mkdir(home, { recursive: true });
  return home;
}

async function createFixture(workRoot, directory, name) {
  const fixture = FIXTURES[name];
  const project = join(workRoot, directory);
  await rm(project, { recursive: true, force: true });
  for (const [path, contents] of Object.entries(fixture.files)) {
    await mkdir(join(project, path, '..'), { recursive: true });
    await writeFile(join(project, path), contents);
  }
  await mkdir(join(project, '.vercel'), { recursive: true });
  await writeFile(
    join(project, '.vercel', 'project.json'),
    `${JSON.stringify({
      projectId: 'prj_native_builders',
      orgId: 'team_native_builders',
      settings: { framework: fixture.framework ?? null },
    })}\n`
  );
  return project;
}

function cliEnv(home, extra = {}) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (
      key !== 'VERCEL_RUNTIME_PYTHON' &&
      (/^(VERCEL_|XDG_|NPM_CONFIG_|npm_config_)/.test(key) ||
        /^(https?_proxy|no_proxy|all_proxy)$/i.test(key))
    ) {
      continue;
    }
    env[key] = value;
  }
  return {
    ...env,
    HOME: home,
    USERPROFILE: home,
    CI: '1',
    FORCE_COLOR: '0',
    NO_COLOR: '1',
    NO_UPDATE_NOTIFIER: '1',
    NEXT_TELEMETRY_DISABLED: '1',
    VERCEL_TELEMETRY_DISABLED: '1',
    ...extra,
  };
}

function proxyEnv(port) {
  const proxy = `http://127.0.0.1:${port}`;
  return {
    HTTPS_PROXY: proxy,
    HTTP_PROXY: proxy,
    https_proxy: proxy,
    http_proxy: proxy,
  };
}

function vercelBuild(project, home, env = {}) {
  return runVercel(['build'], { cwd: project, home, env });
}

function runVercel(
  args,
  { cwd, home, env = {}, timeoutMs = BUILD_TIMEOUT_MS }
) {
  return run(binary, args, { cwd, env: cliEnv(home, env), timeoutMs });
}

function run(command, args, { cwd, env, timeoutMs = BUILD_TIMEOUT_MS }) {
  return new Promise(resolvePromise => {
    const startedAt = Date.now();
    const child = spawn(command, args, {
      cwd,
      env,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const onData = chunk => {
      output += chunk.toString();
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      signalProcessTree(child, 'SIGKILL');
    }, timeoutMs);
    const done = (code, signal) => {
      clearTimeout(timer);
      resolvePromise({
        args,
        code,
        signal,
        timedOut,
        output,
        durationMs: Date.now() - startedAt,
      });
    };
    child.on('error', error => {
      output += `\nspawn error: ${error.message}`;
      done(null, 'SPAWN_ERROR');
    });
    child.on('close', done);
  });
}

function describeRun(result) {
  const status = result.timedOut
    ? `timed out after ${result.durationMs}ms`
    : `exited with ${result.code ?? result.signal} after ${result.durationMs}ms`;
  return `vc ${result.args.join(' ')} ${status}\n${result.output.trim()}`;
}

function assertSucceeded(result) {
  if (result.code !== 0) {
    throw new Error(describeRun(result));
  }
}

async function assertOutputs(project, name) {
  const outputDir = join(project, '.vercel', 'output');
  const config = JSON.parse(
    await readFile(join(outputDir, 'config.json'), 'utf8')
  );
  if (config.version !== 3) {
    throw new Error(`${name}: expected Build Output API version 3.`);
  }
  for (const path of FIXTURES[name].outputs ?? []) {
    await stat(join(outputDir, path)).catch(() => {
      throw new Error(`${name}: .vercel/output/${path} is missing.`);
    });
  }
  for (const [fn, runtime] of Object.entries(FIXTURES[name].functions ?? {})) {
    const configPath = join(
      outputDir,
      'functions',
      `${fn}.func`,
      '.vc-config.json'
    );
    const config = JSON.parse(
      await readFile(configPath, 'utf8').catch(() => {
        throw new Error(`${name}: the ${fn} function is missing.`);
      })
    );
    if (!runtime.test(config.runtime)) {
      throw new Error(
        `${name}: the ${fn} function has runtime ${config.runtime}, expected ${runtime}.`
      );
    }
  }
}

async function findBuildersCache(home) {
  const matches = (await listFiles(home, { directories: true })).filter(path =>
    /(^|\/)builders-vlt$/.test(path)
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected one builders-vlt cache under HOME, found ${matches.length}.`
    );
  }
  return join(home, matches[0]);
}

async function findBuilderRoots(home, builder) {
  const cache = await findBuildersCache(home);
  const roots = [];
  for (const entry of await readdir(cache)) {
    if (!/^[0-9a-f]{64}$/.test(entry)) continue;
    const root = join(cache, entry);
    const marker = await readFile(join(root, '.vercel-builder-graph'), 'utf8')
      .then(contents => contents.trim())
      .catch(() => undefined);
    if (marker !== entry) continue;
    const manifest = await readFile(
      join(root, 'node_modules', ...builder.split('/'), 'package.json'),
      'utf8'
    ).catch(() => undefined);
    if (manifest && JSON.parse(manifest).name === builder) roots.push(root);
  }
  return roots;
}

async function assertBuilderCached(home, builder) {
  if ((await findBuilderRoots(home, builder)).length === 0) {
    throw new Error(
      `${builder} was not installed in the default Builder cache.`
    );
  }
}

async function listFiles(root, { directories = false } = {}, prefix = '') {
  const paths = [];
  let entries;
  try {
    entries = await readdir(join(root, prefix), { withFileTypes: true });
  } catch {
    return paths;
  }
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (directories) paths.push(path);
      if (entry.name === 'node_modules') continue;
      paths.push(...(await listFiles(root, { directories }, path)));
    } else if (!directories) {
      paths.push(path);
    }
  }
  return paths;
}

async function snapshot(root) {
  const entries = [];
  for (const path of (await listFiles(root, { directories: true })).sort()) {
    const info = await stat(join(root, path));
    entries.push(`${path}:${info.mtimeMs}`);
  }
  return entries.join('\n');
}

function getClosedPort() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolvePromise(port));
    });
  });
}

async function check(name, fn) {
  const startedAt = Date.now();
  try {
    await fn();
    results.push({ name, status: 'PASS', durationMs: Date.now() - startedAt });
    console.log(`  PASS  ${name} (${Date.now() - startedAt}ms)`);
  } catch (error) {
    results.push({ name, status: 'FAIL', durationMs: Date.now() - startedAt });
    console.log(`  FAIL  ${name}`);
    console.log(
      String(error?.stack ?? error)
        .split('\n')
        .slice(0, 60)
        .map(line => `        | ${line}`)
        .join('\n')
    );
  }
}

function skip(name, reason) {
  const required = values['require-all'];
  const status = required ? 'FAIL' : 'SKIP';
  if (required) reason = `--require-all forbids skipping: ${reason}`;
  results.push({ name, status, reason });
  console.log(`  ${status}  ${name}: ${reason}`);
  if (process.env.GITHUB_ACTIONS) {
    const level = required ? 'error' : 'notice';
    const outcome = required ? 'required' : 'skipped';
    console.log(
      `::${level} title=Native Builder check ${outcome}::${name}: ${reason}`
    );
  }
}

function printSummary() {
  const counts = { PASS: 0, FAIL: 0, SKIP: 0 };
  for (const { status } of results) counts[status]++;
  console.log(
    `\nNative Builder checks: ${counts.PASS} passed, ${counts.FAIL} failed, ${counts.SKIP} skipped.`
  );
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      '## Native Builder checks',
      '',
      '| Check | Result |',
      '| --- | --- |',
      ...results.map(
        ({ name, status, reason, durationMs }) =>
          `| ${name} | ${status}${reason ? `: ${reason}` : ''}${durationMs ? ` (${Math.round(durationMs / 1000)}s)` : ''} |`
      ),
      '',
    ];
    return writeFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'), {
      flag: 'a',
    });
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
