import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  access,
  appendFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

// This cross-repository check accepts an unpublished, built Queue SDK rather
// than coupling the CLI suite to a package version that is not released yet.
const sdk = process.argv[2] && resolve(process.argv[2]);
const schedulesSdk = process.argv[3] && resolve(process.argv[3]);
assert(
  sdk,
  'Usage: node test/dev/queue-sdk-smoke.mjs /path/to/vqs/packages/queue [/path/to/schedules/packages/schedules]'
);
await access(join(sdk, 'dist/index.mjs'));
const cli = fileURLToPath(new URL('../../dist/vc.js', import.meta.url));
await access(cli);
const { version: cliVersion } = JSON.parse(
  await readFile(new URL('../../package.json', import.meta.url), 'utf8')
);
const fixture = fileURLToPath(
  new URL('./fixtures/nextjs-queue-triggers/', import.meta.url)
);
const dir = await mkdtemp(join(tmpdir(), 'vc-next-queue-'));
let dev;
let closed;
let output = '';

async function run(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  let text = '';
  let errors = '';
  child.stdout.on('data', chunk => {
    text += chunk;
  });
  child.stderr.on('data', chunk => {
    errors += chunk;
  });
  const [code] = await once(child, 'close');
  assert.equal(code, 0, `${command} failed:\n${text}\n${errors}`);
  return text;
}

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve()))
  );
  return port;
}

async function waitFor(check, label) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    assert.equal(
      dev.exitCode,
      null,
      `CLI exited while waiting for ${label}:\n${output}`
    );
    const result = await check();
    if (result) return result;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}:\n${output}`);
}

try {
  await cp(fixture, dir, { recursive: true });
  await run(
    'npm',
    ['install', '--no-package-lock', '--no-audit', '--no-fund'],
    { cwd: dir }
  );
  await mkdir(join(dir, 'node_modules/@vercel'), { recursive: true });
  await symlink(
    sdk,
    join(dir, 'node_modules/@vercel/queue'),
    process.platform === 'win32' ? 'junction' : 'dir'
  );
  if (schedulesSdk) {
    await symlink(
      schedulesSdk,
      join(dir, 'node_modules/@vercel/schedules'),
      process.platform === 'win32' ? 'junction' : 'dir'
    );
    await mkdir(join(dir, 'app/api/scheduled'), { recursive: true });
    await cp(
      join(dir, 'scheduled-route.fixture'),
      join(dir, 'app/api/scheduled/route.js')
    );
    const configPath = join(dir, 'vercel.json');
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    config.functions['app/api/scheduled/route.js'] = {
      experimentalTriggers: [{ type: 'schedule/v1beta' }],
    };
    config.schedules = [
      {
        name: 'static-direct',
        schedule: '0 0 1 1 *',
        timezone: 'UTC',
        function: 'test-app/api/scheduled',
      },
      {
        name: 'static-queued',
        schedule: '0 0 1 1 *',
        timezone: 'UTC',
        topic: 'app-jobs',
      },
    ];
    await writeFile(configPath, JSON.stringify(config));
  }
  const port = await freePort();
  const queuePort = await freePort();
  const cachePort = await freePort();
  const schedulesPort = await freePort();
  const env = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
    VERCEL_TELEMETRY_DISABLED: '1',
    DO_NOT_TRACK: '1',
  };
  delete env.VERCEL_DEPLOYMENT_ID;
  delete env.VERCEL_OIDC_TOKEN;
  delete env.VERCEL_QUEUE_BASE_URL;
  delete env.VERCEL_QUEUE_TOKEN;
  delete env.NODE_ENV;
  env.NODE_OPTIONS = `${env.NODE_OPTIONS || ''} --import ${JSON.stringify(join(dir, 'local-fetch-only.mjs'))}`;
  await mkdir(join(dir, '.config'));
  dev = spawn(
    process.execPath,
    [
      cli,
      'dev',
      '--local',
      '--debug',
      '--listen',
      String(port),
      '--queue-port',
      String(queuePort),
      '--runtime-cache-port',
      String(cachePort),
      '--schedules-port',
      String(schedulesPort),
      '--global-config',
      join(dir, '.config'),
    ],
    {
      cwd: dir,
      env,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  dev.stdout.on('data', chunk => {
    output += chunk;
  });
  dev.stderr.on('data', chunk => {
    output += chunk;
  });
  closed = once(dev, 'close');
  const origin = `http://127.0.0.1:${port}/test-app`;
  const broker = `http://127.0.0.1:${queuePort}`;
  await waitFor(async () => {
    try {
      return (
        await fetch(`${origin}/api/status`, {
          signal: AbortSignal.timeout(2000),
        })
      ).ok;
    } catch {
      return false;
    }
  }, 'Next.js readiness');

  const publicRequest = await fetch(new URL('/api/node-jobs', origin), {
    redirect: 'manual',
  });
  assert.equal(publicRequest.status, 307);
  assert.equal(publicRequest.headers.get('location'), '/test-app/api/status');
  await publicRequest.text();

  const deliveries = async () => {
    try {
      return (await readFile(join(dir, '.results/deliveries.jsonl'), 'utf8'))
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  };
  const publish = async (topic, payload) =>
    JSON.parse(
      await run(
        process.execPath,
        ['publish.mjs', topic, JSON.stringify(payload)],
        {
          cwd: dir,
          env: {
            ...env,
            NODE_ENV: 'development',
            VERCEL_CLI_VERSION: cliVersion,
            VERCEL_QUEUE_BASE_URL: broker,
            VERCEL_QUEUE_TOKEN: 'vc-dev-token',
            VERCEL_REGION: 'dev1',
          },
        }
      )
    );
  const assertAcked = async (topic, entry) => {
    // A 404 can also mean a failed delivery is delayed for retry. Confirm the
    // broker accepted the ACK before asserting that delivery state is gone.
    await waitFor(
      async () =>
        output.includes(
          `queues: ACK message ${entry.metadata.messageId} in group "${entry.metadata.consumerGroup}"`
        ),
      'successful broker acknowledgment'
    );
    const res = await fetch(
      `${broker}/api/v3/topic/${topic}/consumer/${entry.metadata.consumerGroup}/id/${entry.metadata.messageId}`,
      {
        method: 'POST',
        headers: { authorization: 'Bearer vc-dev-token' },
        signal: AbortSignal.timeout(2000),
      }
    );
    await res.text();
    // The current local broker removes ACKed delivery state and returns 404,
    // rather than the production service's more specific 410 response.
    assert.equal(res.status, 404, 'ACKed message must no longer be receivable');
  };

  for (const [router, topic] of [
    ['app', 'app-jobs'],
    ['pages', 'page-jobs'],
    ['node', 'node-jobs'],
  ]) {
    const sent = await publish(topic, { router, failOnce: true });
    assert(sent.messageId);
    const entries = await waitFor(async () => {
      const entries = (await deliveries()).filter(
        entry => entry.metadata.messageId === sent.messageId
      );
      return entries.length >= 2 && entries;
    }, `${router} callback and broker retry`);
    assert.deepEqual(
      entries.map(entry => entry.metadata.deliveryCount),
      [1, 2]
    );
    assert(
      entries.every(entry => entry.router === router && entry.pid !== sent.pid)
    );
    await sleep(1000);
    await assertAcked(topic, entries[1]);
  }

  const beforeReload = await deliveries();
  const routePath = join(dir, 'app/api/app-jobs/route.js');
  await writeFile(
    routePath,
    (await readFile(routePath, 'utf8')).replace("'v1'", "'v2'")
  );
  // Also force configuration reconciliation; ACKed messages must not replay.
  await appendFile(join(dir, 'vercel.json'), '\n');
  await sleep(2000);
  const sent = await publish('app-jobs', { reloaded: true });
  const afterReload = await waitFor(
    async () =>
      (await deliveries()).find(
        entry => entry.metadata.messageId === sent.messageId
      ),
    'reloaded App handler'
  );
  assert.equal(afterReload.version, 'v2');
  await sleep(1500);
  await assertAcked('app-jobs', afterReload);
  assert.equal(
    (await deliveries()).length,
    beforeReload.length + 1,
    'reload must not replay ACKed messages'
  );

  const configPath = join(dir, 'vercel.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const pageTrigger = config.functions['pages/api/page-jobs.js'];
  delete config.functions['pages/api/page-jobs.js'];
  await writeFile(configPath, JSON.stringify(config));
  // A public request awaits the CLI's latest config resolution, including any
  // watcher pass already in flight. No private broker inspection is needed.
  assert((await fetch(`${origin}/api/status`)).ok);
  const pending = await publish('page-jobs', { removed: true });
  const unaffected = await publish('app-jobs', { stillRegistered: true });
  const appEntry = await waitFor(
    async () =>
      (await deliveries()).find(
        entry => entry.metadata.messageId === unaffected.messageId
      ),
    'unaffected callback after configuration removal'
  );
  await sleep(1500);
  await assertAcked('app-jobs', appEntry);
  assert(
    !(await deliveries()).some(
      entry => entry.metadata.messageId === pending.messageId
    ),
    'removed callback must not receive new messages'
  );

  config.functions['pages/api/page-jobs.js'] = pageTrigger;
  await writeFile(configPath, JSON.stringify(config));
  assert((await fetch(`${origin}/api/status`)).ok);
  const restored = await waitFor(
    async () =>
      (await deliveries()).find(
        entry => entry.metadata.messageId === pending.messageId
      ),
    'callback re-registration and retained message delivery'
  );
  assert.equal(restored.metadata.deliveryCount, 1);
  await sleep(1500);
  await assertAcked('page-jobs', restored);
  assert.equal(
    (await deliveries()).length,
    beforeReload.length + 3,
    're-registration must preserve prior acknowledgments'
  );

  if (schedulesSdk) {
    const schedulesEnv = {
      ...env,
      NODE_ENV: 'development',
      VERCEL_SCHEDULE_BASE_URL: `http://127.0.0.1:${schedulesPort}`,
      VERCEL_SCHEDULE_TOKEN: 'vc-dev-token',
      VERCEL_SCHEDULE_DEV_API_VERSION: '1',
    };
    for (const mode of ['manual', 'timed']) {
      const schedule = JSON.parse(
        await run(
          process.execPath,
          ['schedule-publish.mjs', schedulesSdk, mode],
          {
            cwd: dir,
            env: schedulesEnv,
          }
        )
      );
      const entry = await waitFor(
        async () =>
          (await deliveries()).find(
            item => item.payload.scheduleId === schedule.scheduleId
          ),
        `${mode} schedule delivery`
      );
      assert.equal(entry.router, 'app');
      assert.equal(entry.payload.name, schedule.name);
      assert.equal(entry.payload.namespace, schedule.namespace);
      assert.equal(entry.payload.source, 'dynamic');
      assert.deepEqual(entry.payload.payload, schedule.payload);
      assert.match(schedule.scheduleId, /^sch_[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
      assert.match(
        entry.payload.executionId,
        /^schx_[0-7][0-9A-HJKMNP-TV-Z]{25}$/
      );
      assert.equal(entry.metadata.deliveryCount, 1);
      assert(Number.isFinite(Date.parse(entry.payload.scheduledAt)));
      assert(!Object.hasOwn(entry.payload, 'firedAt'));
      if (mode === 'timed') {
        assert.equal(entry.payload.scheduledAt, `${schedule.at}.000Z`);
      }
      await sleep(1500);
      await assertAcked('app-jobs', entry);
      assert.equal(
        (await deliveries()).filter(
          item => item.payload.scheduleId === schedule.scheduleId
        ).length,
        1
      );
    }
    console.log(
      'PASS: default Schedules SDK management API, manual invoke, timed single-fire, complete envelope, and local Queue acknowledgment'
    );

    const manage = async (method, params) =>
      JSON.parse(
        await run(
          process.execPath,
          [
            'manage-schedules.mjs',
            schedulesSdk,
            JSON.stringify({ method, params }),
          ],
          {
            cwd: dir,
            env: schedulesEnv,
          }
        )
      );
    const call = async (method, params) => {
      const reply = await manage(method, params);
      assert(!reply.error, JSON.stringify(reply));
      return reply.result;
    };
    const direct = await call('get', { name: 'static-direct' });
    const queued = await call('get', { name: 'static-queued' });
    assert.equal(direct.source, 'static');
    assert.deepEqual(direct.target, {
      type: 'function',
      function: 'test-app/api/scheduled',
    });
    assert.equal(queued.source, 'static');
    assert.match(direct.scheduleId, /^sch_[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
    assert.match(queued.scheduleId, /^sch_[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
    const invokeDirect = async () => {
      const offset = (await deliveries()).length;
      await call('invoke', { name: 'static-direct' });
      const entry = await waitFor(
        async () =>
          (await deliveries())
            .slice(offset)
            .find(item => item.router === 'direct'),
        'direct Schedule callback'
      );
      assert.equal(entry.metadata.scheduleId, direct.scheduleId);
      assert.equal(entry.metadata.name, direct.name);
      assert.equal(entry.metadata.namespace, direct.namespace);
      assert.equal(entry.metadata.source, 'static');
      assert.match(
        entry.metadata.executionId,
        /^schx_[0-7][0-9A-HJKMNP-TV-Z]{25}$/
      );
      assert(Number.isFinite(Date.parse(entry.metadata.scheduledAt)));
      assert(!Object.hasOwn(entry.metadata, 'firedAt'));
      assert(!Object.hasOwn(entry, 'payload'));
      assert(!Object.hasOwn(entry.metadata, 'payload'));
    };
    const invokeQueued = async payload => {
      const offset = (await deliveries()).length;
      await call('invoke', { name: queued.name });
      const entry = await waitFor(
        async () =>
          (await deliveries())
            .slice(offset)
            .find(item => item.payload?.scheduleId === queued.scheduleId),
        'static Queue callback'
      );
      assert.equal(entry.payload.source, 'static');
      assert.equal(entry.payload.name, queued.name);
      assert.equal(entry.payload.namespace, queued.namespace);
      assert.match(
        entry.payload.executionId,
        /^schx_[0-7][0-9A-HJKMNP-TV-Z]{25}$/
      );
      assert(Number.isFinite(Date.parse(entry.payload.scheduledAt)));
      assert(!Object.hasOwn(entry.payload, 'firedAt'));
      if (payload === undefined)
        assert(!Object.hasOwn(entry.payload, 'payload'));
      else assert.deepEqual(entry.payload.payload, payload);
      await sleep(1000);
      await assertAcked('app-jobs', entry);
    };
    await invokeDirect();
    await invokeQueued();

    const dynamicId = { name: 'preserve-dynamic', namespace: 'static-smoke' };
    const dynamic = await call('create', {
      ...dynamicId,
      expression: {
        type: 'single',
        at: new Date(Date.now() + 3600000).toISOString().slice(0, 19),
      },
      timezone: 'UTC',
      target: { topic: 'app-jobs' },
    });
    await call('disable', { name: direct.name });
    await call('update', {
      name: direct.name,
      payload: { version: 'sdk-edit' },
    });
    const queuePayload = { version: 'sdk-edit', nested: [false, 0, null] };
    await call('update', { name: queued.name, payload: queuePayload });
    await appendFile(join(dir, 'app/api/scheduled/route.js'), '\n');
    await sleep(1000);
    assert((await fetch(`${origin}/api/status`)).ok);
    await invokeDirect();
    await invokeQueued(queuePayload);

    const staticConfigPath = join(dir, 'vercel.json');
    const staticConfig = JSON.parse(await readFile(staticConfigPath, 'utf8'));
    staticConfig.schedules.find(item => item.name === direct.name).schedule =
      '0 1 1 1 *';
    staticConfig.schedules.find(item => item.name === queued.name).timezone =
      'America/New_York';
    await writeFile(staticConfigPath, JSON.stringify(staticConfig));
    await waitFor(
      async () =>
        (await call('get', { name: direct.name })).expression.cron ===
          '0 1 1 1 *' &&
        (await call('get', { name: queued.name })).timezone ===
          'America/New_York',
      'static cron/timezone reconciliation'
    );
    const updated = await call('get', { name: direct.name });
    assert.equal(updated.scheduleId, direct.scheduleId);
    assert.equal(updated.state, 'inactive');
    assert.equal(
      (await call('get', { name: queued.name })).scheduleId,
      queued.scheduleId
    );
    await invokeDirect();
    await invokeQueued(queuePayload);

    // Invalid snapshots must not stop the API/broker or reset managed payloads.
    for (const invalidConfig of [
      '{',
      ...[direct.name, queued.name].map(name =>
        JSON.stringify({
          ...staticConfig,
          schedules: staticConfig.schedules.map(item =>
            item.name === name ? { ...item, payload: { rejected: true } } : item
          ),
        })
      ),
    ]) {
      await writeFile(staticConfigPath, invalidConfig);
      const invalid = await fetch(`${origin}/api/status`);
      await invalid.text();
      assert.equal(invalid.status, 500);
      assert.equal(
        (await call('get', { name: direct.name })).scheduleId,
        direct.scheduleId
      );
      await invokeDirect();
      await invokeQueued(queuePayload);
      await writeFile(staticConfigPath, JSON.stringify(staticConfig));
      assert((await fetch(`${origin}/api/status`)).ok);
    }

    const removed = staticConfig.schedules.find(
      item => item.name === direct.name
    );
    staticConfig.schedules = staticConfig.schedules.filter(
      item => item.name !== direct.name
    );
    await writeFile(staticConfigPath, JSON.stringify(staticConfig));
    await waitFor(
      async () =>
        (await manage('get', { name: direct.name })).error?.status === 404,
      'static definition removal'
    );
    assert.equal(
      (await call('get', { name: queued.name })).scheduleId,
      queued.scheduleId
    );
    assert.equal((await call('get', dynamicId)).scheduleId, dynamic.scheduleId);
    await invokeQueued(queuePayload);
    staticConfig.schedules.push(removed);
    await writeFile(staticConfigPath, JSON.stringify(staticConfig));
    await waitFor(
      async () => (await manage('get', { name: direct.name })).result,
      'static definition restoration'
    );
    assert.notEqual(
      (await call('get', { name: direct.name })).scheduleId,
      direct.scheduleId
    );
    await call('delete', dynamicId);
    console.log(
      'PASS: metadata-only bodyless function delivery, execution IDs, static payload rejection, API-managed Queue payload preservation across source updates/removal, invalid reload retention, stable IDs/state, and dynamic preservation'
    );
  }
  assert(!output.includes('non-local fetch'), output);
  console.log(
    'PASS: manifest-discovered App + Pages callbacks, generic Node invocation bypassing public redirects, basePath/trailingSlash, separate publisher, local ACK/retry, HMR, and callback removal/re-registration without replay'
  );
} catch (error) {
  console.error(output);
  throw error;
} finally {
  if (dev && dev.exitCode === null) {
    const kill = signal => {
      try {
        process.platform === 'win32'
          ? dev.kill(signal)
          : process.kill(-dev.pid, signal);
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    };
    kill('SIGTERM');
    const timeout = setTimeout(() => kill('SIGKILL'), 10_000);
    try {
      await closed;
    } finally {
      clearTimeout(timeout);
    }
  }
  await rm(dir, { recursive: true, force: true });
}
