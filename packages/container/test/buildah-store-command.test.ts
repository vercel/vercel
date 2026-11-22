import { spawn, spawnSync } from 'node:child_process';
import { buildSync } from 'esbuild';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { FileLock } from '../src/buildah-store-cache/lock';
import { storeCommand } from '../src/buildah-store-cache/command';
import type {
  RestoreResult,
  SaveOptions,
  SaveResult,
  StoreCommandRequest,
} from '../src/buildah-store-cache/command/types';

let bundleDirectory: string;
let commandScript: string;
beforeAll(() => {
  bundleDirectory = realpathSync(
    mkdtempSync(join(tmpdir(), 'vercel-buildah-store-command-'))
  );
  commandScript = join(bundleDirectory, 'buildah-store-command.js');
  buildSync({
    entryPoints: [
      join(__dirname, '../src/buildah-store-cache/command/main.ts'),
    ],
    outfile: commandScript,
    bundle: true,
    platform: 'node',
    format: 'cjs',
  });
});
afterAll(() => {
  if (bundleDirectory) {
    rmSync(bundleDirectory, { recursive: true, force: true });
  }
});

const [used, dangling, obsolete] = ['a', 'b', 'c'].map(id => id.repeat(64));
const retainedTag = (id: string) => `localhost/vercel-buildah-store:${id}`;

interface ListedImage {
  id: string;
  names: string[] | null;
}

const savedImages: ListedImage[] = [
  {
    id: `sha256:${used}`,
    names: ['registry/used:latest', 'registry/used:other', retainedTag(used)],
  },
  { id: `sha256:${dangling}`, names: null },
  { id: `sha256:${obsolete}`, names: ['registry/obsolete:old'] },
];

/** GNU tar with zstd and the metadata flags the store command passes, plus flock(1). */
function nativeToolsAvailable(): boolean {
  if (process.platform !== 'linux') return false;
  const probe = mkdtempSync(join(tmpdir(), 'vercel-buildah-store-probe-'));
  try {
    const source = join(probe, 'source');
    const target = join(probe, 'target');
    const archive = join(probe, 'probe.tar.zst');
    mkdirSync(source);
    mkdirSync(target);
    writeFileSync(join(source, 'file'), 'probe');
    const metadata = ['--xattrs', '--xattrs-include=*'];
    const created = spawnSync('tar', [
      '--create',
      '--use-compress-program=zstd -q -1 -T1',
      `--file=${archive}`,
      `--directory=${source}`,
      '--numeric-owner',
      ...metadata,
      '.',
    ]);
    const extracted = spawnSync('tar', [
      '--extract',
      '--zstd',
      `--file=${archive}`,
      `--directory=${target}`,
      '--numeric-owner',
      '--same-owner',
      '--same-permissions',
      ...metadata,
    ]);
    const flock = spawnSync('flock', ['--version']);
    return [created, extracted, flock].every(result => result.status === 0);
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
}

// These shims exercise store command control flow and command scopes, not metadata or OS locks.
const commands = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = process.env.BUILDAH_STORE_TEST_ROOT;
const command = path.basename(process.argv[1]);
const args = process.argv.slice(2);
fs.appendFileSync(path.join(root, 'calls'), JSON.stringify([command, ...args]) + '\n');
const locks = JSON.parse(process.env.BUILDAH_STORE_TEST_LOCKS || '[]');
fs.appendFileSync(path.join(root, 'scopes'), JSON.stringify({ command, locks }) + '\n');
const publish = (name, value) => {
  const file = path.join(root, name);
  fs.writeFileSync(file + '.tmp', JSON.stringify(value));
  fs.renameSync(file + '.tmp', file);
};
if (command === 'flock' && process.env.DETACHED_CLEANUP_ID) {
  process.on('exit', code => publish(process.env.DETACHED_CLEANUP_ID + '.complete', code));
}
if (process.env.BLOCK_COMMAND === command && (!process.env.BLOCK_ACTION || args.includes(process.env.BLOCK_ACTION))) {
  const id = process.env.BLOCK_ID;
  fs.writeFileSync(path.join(root, id + '.ready'), '');
  process.on('exit', code => publish(id + '.finished', code));
  const signal = new Int32Array(new SharedArrayBuffer(4));
  while (!fs.existsSync(path.join(root, id + '.release'))) Atomics.wait(signal, 0, 0, 10);
}
const fail = () => {
  process.stderr.write('simulated ' + command + ' failure\n');
  process.exit(1);
};
if (process.env.FAIL_COMMAND === command && command !== 'tar') fail();
if (command === 'flock') {
  const result = spawnSync(args[3], args.slice(4), {
    stdio: 'inherit',
    env: { ...process.env, BUILDAH_STORE_TEST_LOCKS: JSON.stringify([...locks, args.slice(0, 3)]) },
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
} else if (command === 'mv') {
  fs.renameSync(args.at(-2), args.at(-1));
} else if (command === 'tar') {
  const option = name => args.find(arg => arg.startsWith(name + '=')).slice(name.length + 1);
  const archive = option('--file');
  const directory = option('--directory');
  const staged = path.join(directory, '.vercel-blob-info-cache.sqlite');
  if (args.includes('--extract')) {
    const contents = fs.readFileSync(archive, 'utf8');
    const snapshot = contents.startsWith('{') ? JSON.parse(contents) : { layer: contents };
    fs.writeFileSync(path.join(directory, 'layer'), snapshot.layer);
    if (snapshot.blobInfoCache) fs.writeFileSync(staged, snapshot.blobInfoCache);
    if (contents === 'corrupt') fail();
  } else {
    fs.writeFileSync(archive, 'partial');
    if (process.env.FAIL_COMMAND === command) fail();
    const layer = fs.readFileSync(path.join(directory, 'layer'), 'utf8');
    fs.writeFileSync(archive, fs.existsSync(staged) && fs.statSync(staged).isFile()
      ? JSON.stringify({ layer, blobInfoCache: fs.readFileSync(staged, 'utf8') })
      : layer);
  }
} else if (command === 'buildah') {
  while (['--root', '--runroot'].includes(args[0])) args.splice(0, 2);
  const [action, ...values] = args;
  if (action === 'containers' || action === 'images') {
    process.stdout.write(fs.readFileSync(path.join(root, action), 'utf8'));
  } else if (action === 'rm') {
    const file = path.join(root, 'containers');
    const remaining = fs.readFileSync(file, 'utf8').split('\n').filter(id => id && !values.includes(id));
    fs.writeFileSync(file, remaining.length ? remaining.join('\n') + '\n' : '');
  } else if (action !== 'tag' && action !== 'rmi') {
    throw new Error('unexpected Buildah action: ' + action);
  }
} else {
  throw new Error('unexpected command: ' + command);
}
`;

interface StoreCommandOutput {
  status: number | null;
  stdout: string;
  stderr: string;
  output: RestoreResult | SaveResult | null | undefined;
}

class StoreCommandFixture {
  readonly root = mkdtempSync(join(tmpdir(), 'vercel-buildah-store-command '));
  readonly pending: Promise<StoreCommandOutput>[] = [];
  readonly blocked = new Set<string>();
  readonly detached = new Set<string>();
  private readonly usesFlockShim: boolean;
  readonly gate = new FileLock(join(this.root, 'restore.lock'));
  readonly storeLock = new FileLock(join(this.root, 'store.lock'));
  readonly store = join(this.root, 'store');
  readonly archive = join(this.root, 'snapshot.tar.zst');
  readonly state = join(this.root, 'state');
  readonly marker = join(this.root, 'init', 'attempted');
  readonly blobInfoCache = join(
    this.root,
    'containers-cache',
    'blob-info-cache-v1.sqlite'
  );
  readonly globalArgs = [
    '--root',
    this.store,
    '--runroot',
    join(this.root, 'runroot'),
  ];

  constructor(shims = ['buildah', 'tar', 'mv', 'flock']) {
    this.usesFlockShim = shims.includes('flock');
    for (const directory of ['bin', 'store', 'state']) {
      mkdirSync(join(this.root, directory));
    }
    for (const command of shims) {
      writeFileSync(
        join(this.root, 'bin', command),
        `#!${process.execPath}\n${commands}`,
        { mode: 0o755 }
      );
    }
    writeFileSync(join(this.root, 'calls'), '');
    writeFileSync(join(this.root, 'scopes'), '');
    writeFileSync(join(this.root, 'containers'), '');
  }

  private environment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    return {
      ...process.env,
      PATH: `${join(this.root, 'bin')}${delimiter}${process.env.PATH}`,
      BUILDAH_STORE_TEST_ROOT: this.root,
      BUILDAH_STORE_TEST_LOCKS: '[]',
      FAIL_COMMAND: '',
      BLOCK_COMMAND: '',
      ...env,
    };
  }

  private output(
    status: number | null,
    stdout: string,
    stderr: string
  ): StoreCommandOutput {
    return {
      status,
      stdout,
      stderr,
      output: status === 0 ? JSON.parse(stdout) : undefined,
    };
  }

  run(request: unknown, env: NodeJS.ProcessEnv = {}) {
    return this.runCommand(
      [process.execPath, commandScript, JSON.stringify(request)],
      env
    );
  }

  runCommand([command, ...args]: string[], env: NodeJS.ProcessEnv = {}) {
    const result = spawnSync(command, args, {
      cwd: this.root,
      encoding: 'utf8',
      env: this.environment(env),
    });
    expect(result.error).toBeUndefined();
    return this.output(result.status, result.stdout, result.stderr);
  }

  start([command, ...args]: string[], env: NodeJS.ProcessEnv = {}) {
    if (env.BLOCK_ID) this.blocked.add(env.BLOCK_ID);
    const child = spawn(command, args, {
      cwd: this.root,
      env: this.environment(env),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let finished = false;
    child.stdout.setEncoding('utf8').on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', chunk => {
      stderr += chunk;
    });
    const result = new Promise<StoreCommandOutput>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', status => {
        finished = true;
        try {
          resolve(this.output(status, stdout, stderr));
        } catch (error) {
          reject(error);
        }
      });
    });
    this.pending.push(result);
    return { result, finished: () => finished, pid: child.pid };
  }

  launchDetachedCleanup(record: string, id: string) {
    this.blocked.add(`${id}-command`);
    this.detached.add(id);
    const hook = join(this.root, `${id}.cjs`);
    writeFileSync(
      hook,
      `
      const fs = require('node:fs');
      const path = require('node:path');
      const root = process.env.BUILDAH_STORE_TEST_ROOT;
      const id = process.env.DETACHED_CLEANUP_ID;
      const publish = (name, value) => {
        const file = path.join(root, name);
        fs.writeFileSync(file + '.tmp', JSON.stringify(value));
        fs.renameSync(file + '.tmp', file);
      };
      process.on('exit', code => publish(id + '.done', code));
      publish(id + '-command.ready', { pid: process.pid, parentPid: process.ppid });
      const signal = new Int32Array(new SharedArrayBuffer(4));
      while (!fs.existsSync(path.join(root, id + '-command.release'))) Atomics.wait(signal, 0, 0, 10);
    `
    );
    const [command, ...args] = this.storeLock.shared([
      process.execPath,
      '--require',
      hook,
      commandScript,
      JSON.stringify(this.cleanupRequest(record)),
    ]);
    return this.start(
      [
        process.execPath,
        '-e',
        String.raw`
        const fs = require('node:fs');
        const path = require('node:path');
        const { spawn } = require('node:child_process');
        const root = process.env.BUILDAH_STORE_TEST_ROOT;
        const id = process.env.DETACHED_CLEANUP_ID;
        const [command, ...args] = JSON.parse(process.argv[1]);
        const stdout = fs.openSync(path.join(root, id + '.stdout'), 'w');
        const stderr = fs.openSync(path.join(root, id + '.stderr'), 'w');
        const child = spawn(command, args, { detached: true, stdio: ['ignore', stdout, stderr] });
        fs.closeSync(stdout);
        fs.closeSync(stderr);
        child.on('error', error => { process.stderr.write(error.message); process.exitCode = 1; });
        child.on('spawn', () => {
          fs.writeFileSync(path.join(root, id + '.pid'), String(child.pid));
          child.unref();
          process.stdout.write('null\n');
        });
      `,
        JSON.stringify([command, ...args]),
      ],
      {
        DETACHED_CLEANUP_ID: id,
        BLOCK_COMMAND: 'buildah',
        BLOCK_ACTION: 'rm',
        BLOCK_ID: id,
      }
    );
  }

  async detachedResult(id: string) {
    await this.waitForFile(`${id}.done`);
    if (existsSync(join(this.root, `${id}.ready`))) {
      await this.waitForFile(`${id}.finished`);
    }
    if (this.usesFlockShim) {
      await this.waitForFile(`${id}.complete`);
      expect(
        JSON.parse(readFileSync(join(this.root, `${id}.complete`), 'utf8'))
      ).toBe(0);
    } else {
      await expect
        .poll(() => this.probeLock(this.storeLock.path).status, {
          timeout: 10_000,
        })
        .toBe(0);
    }
    return this.output(
      JSON.parse(readFileSync(join(this.root, `${id}.done`), 'utf8')),
      readFileSync(join(this.root, `${id}.stdout`), 'utf8'),
      readFileSync(join(this.root, `${id}.stderr`), 'utf8')
    );
  }

  private stopDetached(id: string) {
    const file = join(this.root, `${id}.pid`);
    if (!existsSync(file)) return;
    const pid = Number(readFileSync(file, 'utf8'));
    if (!Number.isSafeInteger(pid) || pid <= 0)
      throw new Error('invalid test-owned cleanup PID');
    try {
      process.kill(-pid, 'SIGKILL');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  }

  private async waitForFile(name: string) {
    await expect
      .poll(() => existsSync(join(this.root, name)), { timeout: 10_000 })
      .toBe(true);
  }

  async ready(id: string) {
    await this.waitForFile(`${id}.ready`);
  }

  release(id: string) {
    writeFileSync(join(this.root, `${id}.release`), '');
  }

  async dispose() {
    for (const id of this.blocked) this.release(id);
    try {
      const results = await Promise.allSettled([
        ...this.pending,
        ...[...this.detached].map(async id => {
          try {
            return await this.detachedResult(id);
          } catch (error) {
            this.stopDetached(id);
            throw error;
          }
        }),
      ]);
      for (const result of results) {
        if (result.status === 'rejected') throw result.reason;
      }
    } finally {
      rmSync(this.root, { recursive: true, force: true });
    }
  }

  probeLock(path: string, mode = '--exclusive') {
    return this.runCommand([
      'flock',
      mode,
      '--nonblock',
      '--close',
      path,
      process.execPath,
      '-e',
      "process.stdout.write('null\\n')",
    ]);
  }

  holdSharedStore(id: string) {
    return this.start(
      this.storeLock.shared([
        process.execPath,
        '-e',
        String.raw`
        const fs = require('node:fs');
        const path = require('node:path');
        const root = process.env.BUILDAH_STORE_TEST_ROOT;
        const id = process.env.BLOCK_ID;
        fs.writeFileSync(path.join(root, id + '.ready'), '');
        const signal = new Int32Array(new SharedArrayBuffer(4));
        while (!fs.existsSync(path.join(root, id + '.release'))) Atomics.wait(signal, 0, 0, 10);
        process.stdout.write('null\n');
      `,
      ]),
      { BLOCK_ID: id }
    );
  }

  command(request: StoreCommandRequest) {
    return storeCommand(request, commandScript);
  }

  restoreRequest(): StoreCommandRequest {
    return {
      action: 'restore',
      options: {
        graphRoot: this.store,
        archive: this.archive,
        storeLock: this.storeLock.path,
        marker: this.marker,
        blobInfoCache: this.blobInfoCache,
      },
    };
  }

  saveOptions(): SaveOptions {
    return {
      graphRoot: this.store,
      archive: this.archive,
      stateDirectory: this.state,
      threads: 3,
      blobInfoCache: this.blobInfoCache,
      buildahArgs: this.globalArgs,
    };
  }

  saveRequest(): StoreCommandRequest {
    return { action: 'save', options: this.saveOptions() };
  }

  restore(env: NodeJS.ProcessEnv = {}) {
    return this.run(this.restoreRequest(), env);
  }

  save(env: NodeJS.ProcessEnv = {}) {
    return this.run(this.saveRequest(), env);
  }

  writeBlobInfoCache(contents: string) {
    mkdirSync(dirname(this.blobInfoCache), { recursive: true });
    writeFileSync(this.blobInfoCache, contents);
  }

  cleanupRequest(record: string): StoreCommandRequest {
    return {
      action: 'cleanup',
      options: {
        record,
        buildahArgs: [...this.globalArgs, 'rm', 'vercel-cnb-completed'],
      },
    };
  }

  cleanup(record: string, env: NodeJS.ProcessEnv = {}) {
    return this.run(this.cleanupRequest(record), env);
  }

  writeCleanupRecord(): string {
    const record = join(this.state, 'completed.cleanup');
    writeFileSync(record, 'vercel-cnb-completed\n');
    return record;
  }

  startBlockedCleanup(record: string) {
    return this.start(
      this.storeLock.shared(this.command(this.cleanupRequest(record))),
      { BLOCK_COMMAND: 'buildah', BLOCK_ACTION: 'rm', BLOCK_ID: 'cleanup' }
    );
  }

  scopes(command: string): string[][][] {
    return readFileSync(join(this.root, 'scopes'), 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line) as { command: string; locks: string[][] })
      .filter(call => call.command === command)
      .map(call => call.locks);
  }

  prepareSave() {
    writeFileSync(join(this.store, 'layer'), 'new snapshot');
    writeFileSync(this.archive, 'old snapshot');
    writeFileSync(join(this.state, 'api.images'), `${used.slice(0, 12)}\n`);
    this.writeImages(savedImages);
  }

  writeImages(images: ListedImage[]) {
    writeFileSync(join(this.root, 'images'), JSON.stringify(images));
  }

  calls(command?: string): string[][] {
    const calls = readFileSync(join(this.root, 'calls'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line) as string[]);
    return command
      ? calls.filter(([name]) => name === command).map(([, ...args]) => args)
      : calls;
  }

  buildahCalls() {
    return this.calls('buildah').map(args => {
      expect(args.slice(0, this.globalArgs.length)).toEqual(this.globalArgs);
      return args.slice(this.globalArgs.length);
    });
  }

  temporaryFiles() {
    return readdirSync(this.root).filter(
      name =>
        name.startsWith('store.restore.') ||
        name.startsWith('snapshot.tar.zst.')
    );
  }
}

describe('Buildah store command protocol', () => {
  it('passes the request as one JSON argument', () => {
    const graphRoot = '/store with spaces';
    const request: StoreCommandRequest = {
      action: 'save',
      options: {
        graphRoot,
        archive: '/cache/snapshot.tar.zst',
        blobInfoCache: '/containers-cache/blob-info-cache-v1.sqlite',
        stateDirectory: '/state',
        threads: 3,
        buildahArgs: ['--root', graphRoot],
      },
    };
    const script = '/bundle with spaces/buildah-store-command.js';
    const command = storeCommand(request, script);
    expect(command).toEqual([
      process.execPath,
      script,
      JSON.stringify(request),
    ]);
    expect(JSON.parse(command[2])).toEqual(request);
  });
});

// The extensionless shebang shims require POSIX command execution.
const isPosix = process.platform !== 'win32';
describe.runIf(isPosix)('Buildah store command behavior', () => {
  let fixture: StoreCommandFixture;
  beforeEach(() => {
    fixture = new StoreCommandFixture();
  });
  afterEach(async () => {
    await fixture.dispose();
  });

  it('holds the restore gate around extraction and scopes the store lock to the nested store command', () => {
    writeFileSync(fixture.archive, 'cached layer');
    const result = fixture.runCommand(
      fixture.gate.exclusive(fixture.command(fixture.restoreRequest()))
    );
    expect(result).toMatchObject({
      status: 0,
      output: { status: 'hit', bytes: Buffer.byteLength('cached layer') },
    });
    const gate = ['--exclusive', '--close', fixture.gate.path];
    const store = ['--exclusive', '--close', fixture.storeLock.path];
    expect(fixture.calls('flock')).toEqual([
      [...gate, ...fixture.command(fixture.restoreRequest())],
      [
        ...store,
        ...fixture.command({
          action: 'extract',
          options: {
            graphRoot: fixture.store,
            archive: fixture.archive,
            blobInfoCache: fixture.blobInfoCache,
          },
        }),
      ],
    ]);
    expect(fixture.scopes('tar')).toEqual([[gate, store]]);
    expect(fixture.scopes('mv')).toEqual([[gate, store]]);

    expect(
      fixture.runCommand(
        fixture.gate.exclusive(fixture.command(fixture.restoreRequest()))
      )
    ).toMatchObject({ status: 0, output: { status: 'skipped' } });
    expect(fixture.calls('flock')).toHaveLength(3);
    expect(fixture.calls('tar')).toHaveLength(1);
    expect(fixture.scopes('flock').at(-1)).toEqual([]);
  });

  it('saves once under the exclusive store lock without taking the restore gate', () => {
    fixture.prepareSave();
    const command = fixture.storeLock.exclusive(
      fixture.command(fixture.saveRequest())
    );
    expect(fixture.runCommand(command)).toMatchObject({
      status: 0,
      output: { status: 'saved' },
    });
    const store = ['--exclusive', '--close', fixture.storeLock.path];
    expect(fixture.calls('flock')).toEqual([
      [...store, ...fixture.command(fixture.saveRequest())],
    ]);
    expect(fixture.scopes('tar')).toEqual([[store]]);
    for (const locks of fixture.scopes('buildah')) {
      expect(locks).toEqual([store]);
    }
    const calls = fixture.buildahCalls();
    writeFileSync(join(fixture.store, 'layer'), 'changed after the save');
    expect(fixture.runCommand(command)).toMatchObject({
      status: 0,
      output: { status: 'skipped', previous: 'saved' },
    });
    expect(fixture.calls('tar')).toHaveLength(1);
    expect(fixture.calls('mv')).toHaveLength(1);
    expect(fixture.buildahCalls()).toEqual(calls);
    expect(readFileSync(fixture.archive, 'utf8')).toBe('new snapshot');
  });

  it('waits for its cleanup child before returning null and dropping the shared command scope', async () => {
    const record = fixture.writeCleanupRecord();
    const cleanup = fixture.startBlockedCleanup(record);
    await fixture.ready('cleanup');
    expect(cleanup.finished()).toBe(false);
    expect(readFileSync(record, 'utf8')).toBe('vercel-cnb-completed\n');
    expect(fixture.scopes('buildah')).toEqual([
      [['--shared', '--close', fixture.storeLock.path]],
    ]);
    fixture.release('cleanup');
    await expect(cleanup.result).resolves.toMatchObject({
      status: 0,
      output: null,
    });
    expect(existsSync(record)).toBe(false);
    expect(fixture.buildahCalls()).toEqual([['rm', 'vercel-cnb-completed']]);
  });

  it('runs detached cleanup in its shared command scope after the launcher exits', async () => {
    const id = 'detached-cleanup';
    const record = fixture.writeCleanupRecord();
    writeFileSync(join(fixture.root, 'containers'), 'vercel-cnb-completed\n');
    const launcher = fixture.launchDetachedCleanup(record, id);
    await expect(launcher.result).resolves.toMatchObject({
      status: 0,
      output: null,
    });
    await fixture.ready(`${id}-command`);
    expect(launcher.finished()).toBe(true);
    const storeCommandProcess = JSON.parse(
      readFileSync(join(fixture.root, `${id}-command.ready`), 'utf8')
    ) as { pid: number; parentPid: number };
    const commandPid = Number(
      readFileSync(join(fixture.root, `${id}.pid`), 'utf8')
    );
    expect(commandPid).toBeGreaterThan(0);
    expect(storeCommandProcess.parentPid).toBe(commandPid);
    expect(storeCommandProcess.parentPid).not.toBe(launcher.pid);
    expect(storeCommandProcess.pid).not.toBe(launcher.pid);
    expect(fixture.buildahCalls()).toEqual([]);
    expect(readFileSync(record, 'utf8')).toBe('vercel-cnb-completed\n');

    fixture.release(`${id}-command`);
    await fixture.ready(id);
    expect(fixture.scopes('buildah')).toEqual([
      [['--shared', '--close', fixture.storeLock.path]],
    ]);
    expect(readFileSync(record, 'utf8')).toBe('vercel-cnb-completed\n');
    expect(readFileSync(join(fixture.root, 'containers'), 'utf8')).toBe(
      'vercel-cnb-completed\n'
    );
    fixture.release(id);
    await expect(fixture.detachedResult(id)).resolves.toMatchObject({
      status: 0,
      output: null,
      stderr: '',
    });
    expect(existsSync(record)).toBe(false);
    expect(readFileSync(join(fixture.root, 'containers'), 'utf8')).toBe('');
    expect(fixture.buildahCalls()).toEqual([['rm', 'vercel-cnb-completed']]);
  });

  it('restores once and skips the store lock on a late repeated restore', () => {
    writeFileSync(fixture.archive, 'cached layer');
    expect(fixture.restore()).toMatchObject({
      status: 0,
      output: { status: 'hit', bytes: Buffer.byteLength('cached layer') },
    });
    expect(readFileSync(fixture.marker, 'utf8')).toBe('');
    expect(readFileSync(join(fixture.store, 'layer'), 'utf8')).toBe(
      'cached layer'
    );
    const locks = fixture.calls('flock');
    expect(locks).toHaveLength(1);
    expect(locks[0].slice(0, 3)).toEqual([
      '--exclusive',
      '--close',
      fixture.storeLock.path,
    ]);
    expect(fixture.calls('tar')[0]).toEqual(
      expect.arrayContaining([
        '--extract',
        '--zstd',
        `--file=${fixture.archive}`,
        '--numeric-owner',
        '--same-owner',
        '--same-permissions',
        '--xattrs',
        '--xattrs-include=*',
      ])
    );
    expect(fixture.calls('tar')[0]).not.toContain('--acls');
    expect(fixture.calls('tar')[0]).not.toContain('--selinux');
    const calls = fixture.calls();
    writeFileSync(join(fixture.store, 'layer'), 'live layer');
    expect(fixture.restore({ FAIL_COMMAND: 'flock' })).toMatchObject({
      status: 0,
      output: { status: 'skipped' },
    });
    expect(fixture.calls()).toEqual(calls);
    expect(readFileSync(join(fixture.store, 'layer'), 'utf8')).toBe(
      'live layer'
    );
    expect(fixture.temporaryFiles()).toEqual([]);
  });

  it('rejects a symlinked archive with a clear diagnostic', () => {
    const target = join(fixture.root, 'actual-archive');
    writeFileSync(target, 'cached layer');
    symlinkSync(target, fixture.archive);
    const result = fixture.restore();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `file must not be a symlink: ${fixture.archive}`
    );
    expect(fixture.calls('tar')).toEqual([]);
    expect(readFileSync(target, 'utf8')).toBe('cached layer');
  });

  it('rejects a restore marker that is not a regular file', () => {
    mkdirSync(fixture.marker, { recursive: true });
    const result = fixture.restore();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `expected a regular file: ${fixture.marker}`
    );
    expect(fixture.calls()).toEqual([]);
  });

  it('rejects a symlinked store before pruning or archiving', () => {
    fixture.prepareSave();
    const target = join(fixture.root, 'other-store');
    mkdirSync(target);
    rmSync(fixture.store, { recursive: true });
    symlinkSync(target, fixture.store, 'dir');
    const result = fixture.save();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `directory must not be a symlink: ${fixture.store}`
    );
    expect(fixture.calls()).toEqual([]);
    expect(readFileSync(fixture.archive, 'utf8')).toBe('old snapshot');
  });

  it('rejects a symlinked cleanup record before removing the container', () => {
    const record = join(fixture.state, 'completed.cleanup');
    const target = join(fixture.root, 'actual-cleanup');
    writeFileSync(target, 'vercel-cnb-completed\n');
    symlinkSync(target, record);
    const result = fixture.cleanup(record);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`file must not be a symlink: ${record}`);
    expect(fixture.calls()).toEqual([]);
    expect(readFileSync(target, 'utf8')).toBe('vercel-cnb-completed\n');
  });

  it('marks a missing archive once and skips a later archive without locking', () => {
    expect(fixture.restore({ FAIL_COMMAND: 'flock' })).toMatchObject({
      status: 0,
      output: { status: 'miss', reason: 'no_compatible_snapshot' },
    });
    expect(readFileSync(fixture.marker, 'utf8')).toBe('');
    writeFileSync(fixture.archive, 'cached layer');
    expect(fixture.restore({ FAIL_COMMAND: 'flock' })).toMatchObject({
      status: 0,
      output: { status: 'skipped' },
    });
    expect(fixture.calls()).toEqual([]);
    expect(readdirSync(fixture.store)).toEqual([]);
  });

  it('preserves a warm nonempty store without extracting the archive', () => {
    writeFileSync(join(fixture.store, 'layer'), 'live layer');
    writeFileSync(fixture.archive, 'corrupt');
    expect(fixture.restore()).toMatchObject({
      status: 0,
      output: { status: 'warm' },
    });
    expect(readFileSync(join(fixture.store, 'layer'), 'utf8')).toBe(
      'live layer'
    );
    expect(readdirSync(fixture.store)).toEqual(['layer']);
    expect(fixture.calls('tar')).toEqual([]);
    expect(fixture.calls('mv')).toEqual([]);
    expect(fixture.temporaryFiles()).toEqual([]);
  });

  it.each([
    true,
    false,
  ])('attempts corrupt extraction once (store exists: %s)', exists => {
    if (!exists) rmSync(fixture.store, { recursive: true });
    writeFileSync(fixture.archive, 'corrupt');
    expect(fixture.restore()).toMatchObject({ status: 1 });
    expect(existsSync(fixture.marker)).toBe(true);
    expect(existsSync(fixture.store)).toBe(exists);
    if (exists) expect(readdirSync(fixture.store)).toEqual([]);
    expect(fixture.temporaryFiles()).toEqual([]);
    expect(fixture.calls('tar')).toHaveLength(1);
    const calls = fixture.calls();
    writeFileSync(fixture.archive, 'repaired archive');
    expect(fixture.restore({ FAIL_COMMAND: 'flock' })).toMatchObject({
      status: 0,
      output: { status: 'skipped' },
    });
    expect(fixture.calls()).toEqual(calls);
  });

  it.each([
    '{',
    'null',
    '[]',
    '{"action":"unknown","options":{}}',
  ])('fails malformed store command input before touching the store: %s', input => {
    const result = fixture.runCommand([process.execPath, commandScript, input]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr.trim()).not.toBe('');
    expect(fixture.calls()).toEqual([]);
    expect(existsSync(fixture.marker)).toBe(false);
    expect(existsSync(join(fixture.state, 'save-result'))).toBe(false);
    expect(readdirSync(fixture.store)).toEqual([]);
  });

  it('does not retry a failed save for the same deployment', () => {
    fixture.prepareSave();
    const failure = fixture.save({ FAIL_COMMAND: 'tar' });
    expect(failure.status).toBe(1);
    expect(failure.stdout).toBe('');
    expect(failure.stderr).toContain('simulated tar failure');
    const calls = fixture.calls();
    expect(fixture.save()).toMatchObject({
      status: 0,
      output: { status: 'skipped', previous: 'failed' },
    });
    expect(fixture.calls()).toEqual(calls);
    expect(readFileSync(fixture.archive, 'utf8')).toBe('old snapshot');
  });

  it('leaves the previous snapshot when no service built with Buildah', () => {
    writeFileSync(fixture.archive, 'old snapshot');
    expect(fixture.save()).toMatchObject({
      status: 0,
      output: { status: 'unused' },
    });
    expect(fixture.save()).toMatchObject({
      status: 0,
      output: { status: 'skipped', previous: 'unused' },
    });
    expect(fixture.calls()).toEqual([]);
    expect(readFileSync(fixture.archive, 'utf8')).toBe('old snapshot');
  });

  it('still saves when an old staged blob info copy cannot be removed', () => {
    fixture.prepareSave();
    mkdirSync(join(fixture.store, '.vercel-blob-info-cache.sqlite', 'nested'), {
      recursive: true,
    });
    fixture.writeBlobInfoCache('pushed blobs');
    expect(fixture.save()).toMatchObject({ status: 0 });
    expect(readFileSync(fixture.archive, 'utf8')).toBe('new snapshot');
  });

  it.each(['tar', 'mv'])('preserves the archive on %s failure', command => {
    fixture.prepareSave();
    const result = fixture.save({ FAIL_COMMAND: command });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`simulated ${command} failure`);
    expect(readFileSync(fixture.archive, 'utf8')).toBe('old snapshot');
    expect(fixture.temporaryFiles()).toEqual([]);
  });

  it('drains completed CNB cleanup before checking containers; later cleanup is a no-op', () => {
    fixture.prepareSave();
    const record = fixture.writeCleanupRecord();
    writeFileSync(join(fixture.root, 'containers'), 'vercel-cnb-completed\n');
    expect(fixture.save().status).toBe(0);
    expect(fixture.buildahCalls().slice(0, 2)).toEqual([
      ['rm', 'vercel-cnb-completed'],
      ['containers', '--quiet'],
    ]);
    expect(existsSync(record)).toBe(false);
    expect(readFileSync(join(fixture.root, 'containers'), 'utf8')).toBe('');
    expect(readFileSync(fixture.archive, 'utf8')).toBe('new snapshot');
    const calls = fixture.calls();
    expect(fixture.cleanup(record).status).toBe(0);
    expect(fixture.calls()).toEqual(calls);
  });

  it.each(['save', 'cleanup'])('keeps failed %s cleanup queued', action => {
    fixture.prepareSave();
    const record = fixture.writeCleanupRecord();
    const result =
      action === 'save'
        ? fixture.save({ FAIL_COMMAND: 'buildah' })
        : fixture.cleanup(record, { FAIL_COMMAND: 'buildah' });
    expect(result.status).toBe(1);
    expect(readFileSync(record, 'utf8')).toBe('vercel-cnb-completed\n');
    expect(readFileSync(fixture.archive, 'utf8')).toBe('old snapshot');
    expect(fixture.buildahCalls()).toEqual([['rm', 'vercel-cnb-completed']]);
    expect(fixture.calls('tar')).toEqual([]);
  });

  it('refuses to prune or archive while any container remains active', () => {
    fixture.prepareSave();
    writeFileSync(
      join(fixture.root, 'containers'),
      'unrelated-active-container\n'
    );
    const result = fixture.save();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Buildah containers are still active');
    expect(fixture.buildahCalls()).toEqual([['containers', '--quiet']]);
    expect(fixture.calls('tar')).toEqual([]);
    expect(readFileSync(fixture.archive, 'utf8')).toBe('old snapshot');
  });

  it('stops before tagging, pruning or archiving while a build is unfinished', () => {
    fixture.prepareSave();
    writeFileSync(join(fixture.state, 'web.images'), 'pending\n');
    const result = fixture.save();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Buildah image usage is incomplete');
    expect(fixture.buildahCalls().map(([action]) => action)).toEqual([
      'containers',
      'images',
    ]);
    expect(fixture.calls('tar')).toEqual([]);
    expect(fixture.calls('mv')).toEqual([]);
    expect(readFileSync(fixture.archive, 'utf8')).toBe('old snapshot');
    expect(fixture.temporaryFiles()).toEqual([]);
  });

  it('ignores recorded IDs that match no image and keeps every image a short ID matches', () => {
    fixture.prepareSave();
    const collision = `${used.slice(0, 12)}${'d'.repeat(52)}`;
    fixture.writeImages([
      ...savedImages,
      { id: `sha256:${collision}`, names: ['registry/collision:latest'] },
    ]);
    writeFileSync(
      join(fixture.state, 'web.images'),
      `${'f'.repeat(12)}\n${used.slice(0, 12)}\n`
    );
    expect(fixture.save()).toMatchObject({
      status: 0,
      output: { status: 'saved' },
    });
    const calls = fixture.buildahCalls();
    expect(
      calls
        .filter(([action]) => action === 'tag')
        .map(([, id]) => id)
        .sort()
    ).toEqual([used, collision].sort());
    const [, force, ...pruned] = calls
      .filter(([action]) => action === 'rmi')
      .at(-1)!;
    expect(force).toBe('--force');
    expect(pruned.sort()).toEqual([dangling, obsolete].sort());
  });

  it('untags exact tag names, keeps digest names and prunes digest-only images by ID', () => {
    fixture.prepareSave();
    const pinned = (id: string) => `docker.io/library/alpine@sha256:${id}`;
    fixture.writeImages([
      {
        id: `sha256:${used}`,
        names: ['docker.io/library/alpine:3.20', pinned('d'.repeat(64))],
      },
      { id: `sha256:${obsolete}`, names: [pinned('e'.repeat(64))] },
    ]);
    expect(fixture.save()).toMatchObject({
      status: 0,
      output: { status: 'saved' },
    });
    const calls = fixture.buildahCalls();
    expect(calls.find(([action]) => action === 'images')).toEqual([
      'images',
      '--all',
      '--no-trunc',
      '--json',
    ]);
    expect(calls.filter(([action]) => action === 'tag')).toEqual([
      ['tag', used, retainedTag(used)],
    ]);
    expect(calls.filter(([action]) => action === 'rmi')).toEqual([
      ['rmi', 'docker.io/library/alpine:3.20'],
      ['rmi', '--force', obsolete],
    ]);
    expect(readFileSync(fixture.archive, 'utf8')).toBe('new snapshot');
  });

  it('retains the union of used images, prunes obsolete images and archives with metadata flags', () => {
    fixture.prepareSave();
    writeFileSync(join(fixture.state, 'web.images'), `${dangling}\n${used}\n`);
    writeFileSync(join(fixture.state, 'unfinished.pending'), 'pending\n');
    expect(fixture.save()).toMatchObject({
      status: 0,
      output: { status: 'saved' },
    });
    const calls = fixture.buildahCalls();
    expect(calls.filter(([action]) => action === 'tag')).toEqual(
      expect.arrayContaining([
        ['tag', used, retainedTag(used)],
        ['tag', dangling, retainedTag(dangling)],
      ])
    );
    expect(calls.filter(([action]) => action === 'tag')).toHaveLength(2);
    expect(calls.filter(([action]) => action === 'rmi')).toEqual([
      ['rmi', 'registry/used:latest', 'registry/used:other'],
      ['rmi', '--force', obsolete],
    ]);
    expect(fixture.calls('tar')[0]).toEqual(
      expect.arrayContaining([
        '--create',
        '--use-compress-program=zstd -q -1 -T3',
        `--directory=${fixture.store}`,
        '--one-file-system',
        '--sparse',
        '--numeric-owner',
        '--xattrs',
        '--xattrs-include=*',
        '--exclude=./overlay/*/merged',
        '--exclude=./overlay/*/work/*',
        '.',
      ])
    );
    expect(fixture.calls('tar')[0]).not.toContain('--acls');
    expect(fixture.calls('tar')[0]).not.toContain('--selinux');
    // tar applies matching options only to the exclusions that follow them.
    const create = fixture.calls('tar')[0];
    const firstExclusion = create.findIndex(arg =>
      arg.startsWith('--exclude=')
    );
    expect(create.slice(0, firstExclusion)).toEqual(
      expect.arrayContaining(['--anchored', '--no-wildcards-match-slash'])
    );
    expect(fixture.calls('mv')).toEqual([
      [
        '-fT',
        '--',
        expect.stringMatching(/snapshot\.tar\.zst\.[^/]+$/),
        fixture.archive,
      ],
    ]);
    expect(readFileSync(fixture.archive, 'utf8')).toBe('new snapshot');
    expect(fixture.temporaryFiles()).toEqual([]);
  });

  it('carries the blob info cache from save to a fresh restore', () => {
    fixture.prepareSave();
    fixture.writeBlobInfoCache('pushed blobs');
    expect(fixture.save().status).toBe(0);
    rmSync(fixture.store, { recursive: true });
    rmSync(dirname(fixture.blobInfoCache), { recursive: true });
    expect(fixture.restore()).toMatchObject({
      status: 0,
      output: { status: 'hit', bytes: statSync(fixture.archive).size },
    });
    expect(readFileSync(fixture.blobInfoCache, 'utf8')).toBe('pushed blobs');
  });

  it('does not replace a blob info cache Buildah already created', () => {
    writeFileSync(
      fixture.archive,
      JSON.stringify({ layer: 'cached layer', blobInfoCache: 'old blobs' })
    );
    fixture.writeBlobInfoCache('live blobs');
    expect(fixture.restore()).toMatchObject({
      status: 0,
      output: { status: 'hit', bytes: statSync(fixture.archive).size },
    });
    expect(readFileSync(fixture.blobInfoCache, 'utf8')).toBe('live blobs');
  });

  it('drops the previous copy when the blob info cache has an interrupted write', () => {
    fixture.prepareSave();
    writeFileSync(
      join(fixture.store, '.vercel-blob-info-cache.sqlite'),
      'old blobs'
    );
    fixture.writeBlobInfoCache('pushed blobs');
    writeFileSync(`${fixture.blobInfoCache}-journal`, 'rollback');
    expect(fixture.save().status).toBe(0);
    expect(readFileSync(fixture.archive, 'utf8')).toBe('new snapshot');
  });
});

const nativeTools = nativeToolsAvailable();
// Linux CI must run these, so missing tools fail there instead of being skipped.
const requireNativeTools =
  process.platform === 'linux' && Boolean(process.env.CI);

describe.runIf(nativeTools || requireNativeTools)(
  'Buildah store command with native process locks',
  () => {
    let fixture: StoreCommandFixture;
    beforeEach(() => {
      fixture = new StoreCommandFixture(['buildah', 'tar', 'mv']);
    });
    afterEach(async () => {
      await fixture.dispose();
    });

    it('serializes concurrent restores with the gate and extracts only once', async () => {
      writeFileSync(fixture.archive, 'cached layer');
      const command = fixture.gate.exclusive(
        fixture.command(fixture.restoreRequest())
      );
      const first = fixture.start(command, {
        BLOCK_COMMAND: 'tar',
        BLOCK_ID: 'restore',
      });
      await fixture.ready('restore');
      expect(fixture.probeLock(fixture.gate.path, '--shared').status).toBe(1);
      expect(fixture.probeLock(fixture.storeLock.path, '--shared').status).toBe(
        1
      );
      const second = fixture.start(command);
      fixture.release('restore');
      await expect(first.result).resolves.toMatchObject({
        status: 0,
        output: { status: 'hit', bytes: Buffer.byteLength('cached layer') },
      });
      await expect(second.result).resolves.toMatchObject({
        status: 0,
        output: { status: 'skipped' },
      });
      expect(fixture.calls('tar')).toHaveLength(1);
      expect(fixture.probeLock(fixture.storeLock.path).status).toBe(0);
      expect(fixture.probeLock(fixture.gate.path).status).toBe(0);
    });

    it('serializes concurrent saves under the store lock without holding the gate', async () => {
      fixture.prepareSave();
      const command = fixture.storeLock.exclusive(
        fixture.command(fixture.saveRequest())
      );
      const first = fixture.start(command, {
        BLOCK_COMMAND: 'tar',
        BLOCK_ID: 'save',
      });
      await fixture.ready('save');
      expect(fixture.probeLock(fixture.storeLock.path, '--shared').status).toBe(
        1
      );
      expect(fixture.probeLock(fixture.gate.path).status).toBe(0);
      const second = fixture.start(command);
      fixture.release('save');
      await expect(first.result).resolves.toMatchObject({
        status: 0,
        output: { status: 'saved' },
      });
      await expect(second.result).resolves.toMatchObject({
        status: 0,
        output: { status: 'skipped', previous: 'saved' },
      });
      expect(fixture.calls('tar')).toHaveLength(1);
      expect(fixture.probeLock(fixture.storeLock.path).status).toBe(0);
    });

    it('finishes a late restore while a sibling build still holds the shared store lock', async () => {
      const command = fixture.gate.exclusive(
        fixture.command(fixture.restoreRequest())
      );
      expect(fixture.runCommand(command)).toMatchObject({
        status: 0,
        output: { status: 'miss', reason: 'no_compatible_snapshot' },
      });
      writeFileSync(fixture.archive, 'late archive');
      const build = fixture.holdSharedStore('build');
      await fixture.ready('build');
      expect(fixture.probeLock(fixture.storeLock.path).status).toBe(1);
      const late = fixture.start(command);
      await expect.poll(late.finished, { timeout: 10_000 }).toBe(true);
      await expect(late.result).resolves.toMatchObject({
        status: 0,
        output: { status: 'skipped' },
      });
      expect(build.finished()).toBe(false);
      expect(fixture.probeLock(fixture.storeLock.path).status).toBe(1);
      expect(fixture.probeLock(fixture.gate.path).status).toBe(0);
      expect(fixture.calls('tar')).toEqual([]);
      fixture.release('build');
      await expect(build.result).resolves.toMatchObject({
        status: 0,
        output: null,
      });
    });

    it('keeps detached cleanup locked after its launcher exits and releases the lock on completion', async () => {
      const id = 'detached-cleanup';
      const record = fixture.writeCleanupRecord();
      const launcher = fixture.launchDetachedCleanup(record, id);
      await expect(launcher.result).resolves.toMatchObject({
        status: 0,
        output: null,
      });
      await fixture.ready(`${id}-command`);
      expect(launcher.finished()).toBe(true);
      expect(fixture.buildahCalls()).toEqual([]);
      expect(fixture.probeLock(fixture.storeLock.path).status).toBe(1);
      expect(fixture.probeLock(fixture.storeLock.path, '--shared').status).toBe(
        0
      );

      fixture.release(`${id}-command`);
      await fixture.ready(id);
      expect(existsSync(record)).toBe(true);
      expect(fixture.probeLock(fixture.storeLock.path).status).toBe(1);
      fixture.release(id);
      await expect(fixture.detachedResult(id)).resolves.toMatchObject({
        status: 0,
        output: null,
        stderr: '',
      });
      expect(existsSync(record)).toBe(false);
      expect(fixture.probeLock(fixture.storeLock.path).status).toBe(0);
    });

    it('retains the cleanup shared lock until its Buildah child exits, then releases it', async () => {
      const record = fixture.writeCleanupRecord();
      const cleanup = fixture.startBlockedCleanup(record);
      await fixture.ready('cleanup');
      expect(cleanup.finished()).toBe(false);
      expect(existsSync(record)).toBe(true);
      expect(fixture.probeLock(fixture.storeLock.path).status).toBe(1);
      expect(fixture.probeLock(fixture.storeLock.path, '--shared').status).toBe(
        0
      );
      fixture.release('cleanup');
      await expect(cleanup.result).resolves.toMatchObject({
        status: 0,
        output: null,
      });
      expect(existsSync(record)).toBe(false);
      expect(fixture.probeLock(fixture.storeLock.path).status).toBe(0);
    });
  }
);

// Only Buildah is faked here: archive metadata, renames and locks are real.
describe.runIf(nativeTools || requireNativeTools)(
  'Buildah store command with native tar, zstd and flock',
  () => {
    let fixture: StoreCommandFixture;
    beforeEach(() => {
      fixture = new StoreCommandFixture(['buildah']);
    });
    afterEach(async () => {
      await fixture.dispose();
    });

    it('finds GNU tar with zstd and metadata support, and flock', () => {
      expect(nativeTools).toBe(true);
    });

    it('round-trips layer content, links and permissions but not overlay mounts', () => {
      fixture.prepareSave();
      const overlay = join(fixture.store, 'overlay');
      const layer = join(overlay, 'layer-id');
      const files: Record<string, string> = {
        [join(layer, 'diff', 'app', 'work', 'data')]: 'layer file under work',
        [join(layer, 'diff', 'srv', 'merged', 'data')]:
          'layer file under merged',
        [join(layer, 'merged', 'mounted')]: 'overlay mount',
        [join(layer, 'work', 'work', 'scratch')]: 'overlay scratch',
      };
      for (const [path, contents] of Object.entries(files)) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, contents);
      }
      mkdirSync(join(overlay, 'l'));
      symlinkSync('../layer-id/diff', join(overlay, 'l', 'SHORTID'));
      writeFileSync(join(overlay, 'private'), 'owner only', { mode: 0o600 });
      fixture.writeBlobInfoCache('pushed blobs');

      expect(fixture.save()).toMatchObject({ status: 0 });
      expect(readFileSync(fixture.archive).subarray(0, 4)).toEqual(
        Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
      );
      rmSync(fixture.store, { recursive: true });
      rmSync(dirname(fixture.blobInfoCache), { recursive: true });

      expect(fixture.restore()).toMatchObject({
        status: 0,
        output: { status: 'hit', bytes: statSync(fixture.archive).size },
      });
      expect(readFileSync(join(fixture.store, 'layer'), 'utf8')).toBe(
        'new snapshot'
      );
      expect(
        readFileSync(join(layer, 'diff', 'app', 'work', 'data'), 'utf8')
      ).toBe('layer file under work');
      expect(
        readFileSync(join(layer, 'diff', 'srv', 'merged', 'data'), 'utf8')
      ).toBe('layer file under merged');
      expect(existsSync(join(layer, 'merged'))).toBe(false);
      expect(readdirSync(join(layer, 'work'))).toEqual([]);
      expect(readlinkSync(join(overlay, 'l', 'SHORTID'))).toBe(
        '../layer-id/diff'
      );
      expect(statSync(join(overlay, 'private')).mode & 0o777).toBe(0o600);
      expect(readFileSync(fixture.blobInfoCache, 'utf8')).toBe('pushed blobs');
      expect(fixture.temporaryFiles()).toEqual([]);
    });

    it('leaves no partial store after a corrupt snapshot', () => {
      writeFileSync(fixture.archive, 'not a zstd archive');
      expect(fixture.restore().status).not.toBe(0);
      expect(readdirSync(fixture.store)).toEqual([]);
      expect(fixture.temporaryFiles()).toEqual([]);
    });
  }
);
