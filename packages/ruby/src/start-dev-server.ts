import { spawn, type ChildProcess } from 'child_process';
import { join, dirname, basename } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import type { StartDevServer } from '@vercel/build-utils';
import { debug } from '@vercel/build-utils';
import execa from 'execa';

// Track persistent dev servers so background tasks continue across requests
const PERSISTENT_SERVERS = new Map<
  string,
  { port: number; pid: number; child: ChildProcess }
>();
const PENDING_STARTS = new Map<
  string,
  Promise<{ port: number; pid: number }>
>();

function hasGemfileForEntry(workPath: string, entrypoint: string): boolean {
  const entryAbs = join(workPath, entrypoint);
  const dir = dirname(entryAbs);
  const p = join(dir, 'Gemfile');
  return existsSync(p);
}

async function hasRackupBundled(appDir: string): Promise<boolean> {
  try {
    const res = await execa(
      'bundle',
      [
        'exec',
        'ruby',
        '-e',
        "begin; gem 'rackup'; print 'ok'; rescue Gem::LoadError; end",
      ],
      { cwd: appDir, stdio: 'pipe', reject: false }
    );
    return res.stdout.includes('ok');
  } catch {
    return false;
  }
}

function detectPortFromOutput(data: string): number | null {
  // Common Rack servers:
  // Puma: "Listening on tcp://127.0.0.1:9292"
  // WEBrick: "WEBrick::HTTPServer#start: pid=..., port=9292"
  // Thin / Rack: "http://127.0.0.1:9292", "Listening on 127.0.0.1:9292"
  const patterns = [
    /Listening on (?:tcp:\/\/)?(?:\[[^\]]+\]|[^:]+):(\d+)/i,
    /WEBrick::HTTPServer#start:.*port=(\d+)/i,
    /https?:\/\/(?:\[[^\]]+\]|[^:]+):(\d+)/i,
  ];
  for (const re of patterns) {
    const m = data.match(re);
    if (m && m[1]) return Number(m[1]);
  }
  return null;
}

export const startDevServer: StartDevServer = async opts => {
  const { workPath, entrypoint, meta = {} } = opts;
  const key = `${workPath}::${entrypoint}`;

  const existing = PERSISTENT_SERVERS.get(key);
  if (existing) {
    return { port: existing.port, pid: existing.pid, shutdown: async () => {} };
  }
  const pending = PENDING_STARTS.get(key);
  if (pending) {
    const { port, pid } = await pending;
    return { port, pid, shutdown: async () => {} };
  }

  let resolveReady: (value: { port: number; pid: number }) => void;
  let rejectReady: (reason: any) => void;
  const ready = new Promise<{ port: number; pid: number }>((res, rej) => {
    resolveReady = res;
    rejectReady = rej;
  });
  PENDING_STARTS.set(key, ready);

  try {
    const entryAbs = join(workPath, entrypoint);
    const appDir = dirname(entryAbs);
    const entryBase = basename(entryAbs);

    // Prefer bundler if Gemfile exists next to the entrypoint
    const useBundler = hasGemfileForEntry(workPath, entrypoint);

    if (useBundler) {
      // Ensure gems are installed locally to vendor/bundle
      const bundleEnv = {
        ...process.env,
        ...(meta.env || {}),
        BUNDLE_PATH: join(appDir, 'vendor', 'bundle'),
        BUNDLE_SILENCE_ROOT_WARNING: '1',
      } as NodeJS.ProcessEnv;
      debug(`ruby: running bundle install in ${appDir}`);
      const res = await execa(
        'bundle',
        ['install', '--path', 'vendor/bundle'],
        {
          cwd: appDir,
          env: bundleEnv,
          stdio: 'pipe',
          reject: false,
        }
      );
      if (res.exitCode !== 0) {
        debug(`ruby: bundle install failed\n${res.stdout}\n${res.stderr}`);
        throw new Error('bundle install failed');
      }
    }

    let cmd = '';
    let args: string[] = [];

    if (entrypoint.endsWith('.ru')) {
      let canUseRackup = false;
      if (useBundler) {
        canUseRackup = await hasRackupBundled(appDir);
      }
      if (useBundler && canUseRackup) {
        cmd = 'bundle';
        args = ['exec', 'rackup', entryBase, '-o', '127.0.0.1'];
      } else {
        // Fallback: use vc_init_dev.rb template to run config.ru via WEBrick
        const srcTemplate = join(__dirname, '..', 'vc_init_dev.rb');
        const shimDir = join(appDir, '.vercel', 'ruby');
        mkdirSync(shimDir, { recursive: true });
        const runnerPath = join(shimDir, 'vc_init_dev.rb');
        let code = require('fs').readFileSync(srcTemplate, 'utf8');
        code = code
          .replace('__VC_DEV_RACK_PATH__', entryBase)
          .replace('__VC_DEV_HOST__', '127.0.0.1');
        writeFileSync(runnerPath, code, 'utf8');
        cmd = useBundler ? 'bundle' : 'ruby';
        args = useBundler ? ['exec', 'ruby', runnerPath] : [runnerPath];
      }
    } else {
      // Plain Ruby script (app.rb) - run it directly
      if (useBundler) {
        cmd = 'bundle';
        args = ['exec', 'ruby', entryBase];
      } else {
        cmd = 'ruby';
        args = [entryBase];
      }
    }

    const env = { ...process.env, ...(meta.env || {}) } as NodeJS.ProcessEnv;
    if (useBundler) {
      env.BUNDLE_PATH = env.BUNDLE_PATH || join(appDir, 'vendor', 'bundle');
      env.BUNDLE_GEMFILE = env.BUNDLE_GEMFILE || join(appDir, 'Gemfile');
    }

    debug(
      `ruby: spawning dev server: (cwd=${appDir}) ${cmd} ${args.join(' ')}`
    );
    const child = spawn(cmd, args, {
      cwd: appDir,
      env,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let resolved = false;
    const onData = (buf: Buffer) => {
      const line = buf.toString();
      process.stdout.write(line);
      if (resolved) return;
      const port = detectPortFromOutput(line);
      if (port && child.pid) {
        resolved = true;
        child.stdout?.off('data', onData);
        child.stderr?.off('data', onData);
        PERSISTENT_SERVERS.set(key, { port, pid: child.pid, child });
        resolveReady({ port, pid: child.pid });
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);

    child.once('error', err => {
      if (!resolved) {
        rejectReady(err);
      }
    });
    child.once('exit', (code, signal) => {
      debug(`ruby: dev server exited (code=${code} signal=${signal})`);
      if (!resolved) {
        rejectReady(
          new Error(`Ruby dev server exited before binding to a port.`)
        );
      }
      PERSISTENT_SERVERS.delete(key);
    });

    const { port, pid } = await ready;
    return { port, pid, shutdown: async () => {} };
  } finally {
    PENDING_STARTS.delete(key);
  }
};
