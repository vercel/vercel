import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  detectMigrationSignals,
  formatMigrationSignals,
  unresolvedByProposedConfig,
  type MigrationSignal,
} from '../../../../src/commands/onboard/migration-signals';

describe('migration signals', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), 'onboard-signals-'));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  async function write(file: string, content: string): Promise<void> {
    await mkdir(join(cwd, dirname(file)), { recursive: true });
    await writeFile(join(cwd, file), content);
  }

  function detect(intentFiles: string[] = [], dirs = ['.']) {
    return detectMigrationSignals(cwd, { dirs, intentFiles });
  }

  describe('docker compose', () => {
    const COMPOSE = `
services:
  web:
    build: .
    ports: ["3000:3000"]
    volumes:
      - artifacts:/data/artifacts
  worker:
    build: .
    command: npm run worker
    volumes:
      - artifacts:/data/artifacts
  db:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  artifacts:
  pgdata:
`;

    it('detects shared volumes, database volumes, and resident workers', async () => {
      await write('docker-compose.yml', COMPOSE);
      const signals = await detect(['docker-compose.yml']);

      expect(signals).toContainEqual({
        kind: 'shared-volume',
        source: 'docker-compose.yml',
        evidence: 'Named volume `artifacts` mounted by `web` and `worker`',
        confidence: 'high',
      });
      expect(signals).toContainEqual(
        expect.objectContaining({
          kind: 'database-volume',
          affectedService: 'db',
          confidence: 'high',
        })
      );
      expect(signals).toContainEqual(
        expect.objectContaining({
          kind: 'resident-worker',
          affectedService: 'worker',
          evidence: 'Service `worker` runs `npm run worker` with no ports',
        })
      );
      // A volume mounted once is not shared.
      expect(
        signals.filter(signal => signal.kind === 'shared-volume')
      ).toHaveLength(1);
    });

    it('does not call a ported web service a worker, nor a db volume shared', async () => {
      await write(
        'compose.yaml',
        `
services:
  web:
    ports: ["3000:3000"]
    command: npm run start
  db:
    image: postgres:16
volumes: {}
`
      );
      const signals = await detect(['compose.yaml']);
      expect(signals.filter(s => s.kind === 'resident-worker')).toHaveLength(0);
      expect(signals.filter(s => s.kind === 'shared-volume')).toHaveLength(0);
      // No volume on the db either.
      expect(signals.filter(s => s.kind === 'database-volume')).toHaveLength(0);
    });

    it('detects cron-shaped service commands as schedulers', async () => {
      await write(
        'docker-compose.yml',
        'services:\n  jobs:\n    command: crond -f\n'
      );
      const signals = await detect(['docker-compose.yml']);
      expect(signals).toContainEqual(
        expect.objectContaining({ kind: 'scheduler', affectedService: 'jobs' })
      );
    });

    it('survives an unparseable compose file', async () => {
      await write('docker-compose.yml', '{{ not yaml: [');
      await expect(detect(['docker-compose.yml'])).resolves.toEqual([]);
    });
  });

  describe('Procfile', () => {
    it('reads non-web processes as workers and clock processes as schedulers', async () => {
      await write(
        'Procfile',
        'web: gunicorn app:app\nworker: celery -A app worker\nclock: python scheduler.py\n'
      );
      const signals = await detect(['Procfile']);
      expect(signals).toContainEqual(
        expect.objectContaining({
          kind: 'resident-worker',
          affectedService: 'worker',
          evidence: 'Process `worker` runs `celery -A app worker`',
        })
      );
      expect(signals).toContainEqual(
        expect.objectContaining({ kind: 'scheduler', affectedService: 'clock' })
      );
      // `web` is the request path, not a signal.
      expect(signals.some(signal => signal.affectedService === 'web')).toBe(
        false
      );
    });
  });

  describe('reverse proxies', () => {
    it('normalizes nginx proxy locations into route facts', async () => {
      await write(
        'nginx.conf',
        `
server {
  listen 80;
  location / {
    root /usr/share/nginx/html;
    try_files $uri /index.html;
  }
  location /api/ {
    proxy_pass http://api:8000;
    proxy_set_header Host $host;
  }
}
`
      );
      const signals = await detect(['nginx.conf']);
      expect(signals).toEqual([
        {
          kind: 'reverse-proxy-route',
          source: 'nginx.conf',
          evidence: 'Route `/api/` proxies to `http://api:8000`',
          confidence: 'high',
        },
      ]);
    });

    it('reads Caddyfile reverse_proxy lines at medium confidence', async () => {
      await write(
        'Caddyfile',
        'example.com {\n  reverse_proxy /api/* api:8000\n}\n'
      );
      const signals = await detect(['Caddyfile']);
      expect(signals).toEqual([
        expect.objectContaining({
          kind: 'reverse-proxy-route',
          evidence: 'Route `/api/*` proxies to `api:8000`',
          confidence: 'medium',
        }),
      ]);
    });
  });

  describe('dependency manifests', () => {
    it('reads schedulers, queues, sqlite, sessions, and sockets from package.json', async () => {
      await write(
        'package.json',
        JSON.stringify({
          dependencies: {
            'node-cron': '^3.0.0',
            bullmq: '^5.0.0',
            'better-sqlite3': '^11.0.0',
            'express-session': '^1.18.0',
            'socket.io': '^4.0.0',
          },
        })
      );
      const signals = await detect();
      const kinds = signals.map(signal => signal.kind);
      expect(kinds).toContain('scheduler');
      expect(kinds).toContain('resident-worker');
      expect(kinds).toContain('sqlite-runtime');
      expect(kinds).toContain('memory-session-store');
      expect(kinds).toContain('websocket');
    });

    it('a configured external session store silences the session signal', async () => {
      await write(
        'package.json',
        JSON.stringify({
          dependencies: {
            'express-session': '^1.18.0',
            'connect-redis': '^7.0.0',
          },
        })
      );
      const signals = await detect();
      expect(
        signals.some(signal => signal.kind === 'memory-session-store')
      ).toBe(false);
    });

    it('devDependencies do not count as runtime signals', async () => {
      await write(
        'package.json',
        JSON.stringify({ devDependencies: { sqlite3: '^5.0.0' } })
      );
      expect(await detect()).toEqual([]);
    });

    it('reads Python schedulers and workers from requirements.txt', async () => {
      await write(
        'api/requirements.txt',
        'fastapi==0.110.0\napscheduler==3.10.0\ncelery==5.3.0\n'
      );
      const signals = await detect([], ['.', 'api']);
      expect(signals).toContainEqual(
        expect.objectContaining({
          kind: 'scheduler',
          source: 'api/requirements.txt',
        })
      );
      expect(signals).toContainEqual(
        expect.objectContaining({
          kind: 'resident-worker',
          source: 'api/requirements.txt',
        })
      );
    });
  });

  describe('source scanning', () => {
    it('finds runtime sqlite imports with the citing line as evidence', async () => {
      await write(
        'server/db.js',
        "const Database = require('better-sqlite3');\nmodule.exports = new Database('todos.db');\n"
      );
      const signals = await detect();
      expect(signals).toContainEqual({
        kind: 'sqlite-runtime',
        source: 'server/db.js',
        evidence:
          "Runtime SQLite usage: `const Database = require('better-sqlite3');`",
        confidence: 'high',
      });
    });

    it('ignores sqlite inside test directories and test files', async () => {
      await write(
        'tests/db.test.js',
        "const Database = require('better-sqlite3');\n"
      );
      await write('src/db.spec.ts', "import sqlite3 from 'sqlite3';\n");
      expect(await detect()).toEqual([]);
    });

    it('never reads .env files, so secrets cannot become evidence', async () => {
      await write('.env', 'DATABASE_URL=sqlite:///prod.db\nSECRET=hunter2\n');
      const signals = await detect();
      expect(JSON.stringify(signals)).not.toContain('hunter2');
      expect(signals).toEqual([]);
    });

    it('detects a custom server combining HTTP and WebSocket', async () => {
      await write(
        'server.js',
        [
          "const express = require('express');",
          "const { Server } = require('socket.io');",
          'const app = express();',
          "const http = require('http').createServer(app);",
          'new Server(http);',
          'http.listen(3000);',
        ].join('\n')
      );
      const signals = await detect();
      expect(signals).toContainEqual(
        expect.objectContaining({ kind: 'custom-server', source: 'server.js' })
      );
      expect(signals).toContainEqual(
        expect.objectContaining({
          kind: 'websocket',
          source: 'server.js',
          confidence: 'high',
        })
      );
    });
  });

  describe('determinism and rendering', () => {
    it('returns stable, deterministically ordered, deduplicated signals', async () => {
      await write('Procfile', 'worker: node worker.js\nclock: node clock.js\n');
      await write(
        'package.json',
        JSON.stringify({ dependencies: { bullmq: '^5.0.0' } })
      );
      const first = await detect(['Procfile']);
      const second = await detect(['Procfile']);
      expect(first).toEqual(second);
      const keys = first.map(s => `${s.kind}:${s.source}:${s.evidence}`);
      expect(keys).toEqual([...keys].sort());
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('formats signals with confidence and source, or nothing at all', () => {
      expect(formatMigrationSignals([])).toBeUndefined();
      const rendered = formatMigrationSignals([
        {
          kind: 'shared-volume',
          source: 'docker-compose.yml',
          evidence: 'Named volume `artifacts` mounted by `web` and `worker`',
          confidence: 'high',
        },
      ]);
      expect(rendered).toContain(
        '[high] Named volume `artifacts` mounted by `web` and `worker` (docker-compose.yml)'
      );
      // Facts, not verdicts.
      expect(rendered).not.toMatch(/impossible|cannot be supported/i);
    });

    it('marks everything except proxy routes as unresolved by a services config', () => {
      const signals: MigrationSignal[] = [
        {
          kind: 'reverse-proxy-route',
          source: 'nginx.conf',
          evidence: 'Route `/api/` proxies to `http://api:8000`',
          confidence: 'high',
        },
        {
          kind: 'resident-worker',
          source: 'Procfile',
          evidence: 'Process `worker` runs `node worker.js`',
          confidence: 'high',
        },
      ];
      expect(unresolvedByProposedConfig(signals)).toEqual([signals[1]]);
    });
  });
});
