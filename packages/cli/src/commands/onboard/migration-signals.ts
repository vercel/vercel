import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import yaml from 'js-yaml';
import output from '../../output-manager';

/**
 * Migration-risk signals: the semantics inside the deployment-intent files
 * that decide whether a lift-and-shift actually works — shared volumes,
 * resident workers, reverse-proxy routes, runtime SQLite, in-memory
 * sessions, schedulers, custom servers.
 *
 * Every signal is a locally measured fact with a source file and a bounded
 * evidence excerpt. Nothing here decides what to do about a signal, and
 * nothing states that a signal is impossible on Vercel — the migration plan
 * must account for it, which is the agent's job. Detection is deliberately
 * conservative: a missed signal costs the agent a discovery round trip; a
 * false one poisons the plan.
 */

export type MigrationSignalKind =
  | 'reverse-proxy-route'
  | 'shared-volume'
  | 'database-volume'
  | 'resident-worker'
  | 'scheduler'
  | 'sqlite-runtime'
  | 'memory-session-store'
  | 'custom-server'
  | 'websocket';

export interface MigrationSignal {
  kind: MigrationSignalKind;
  /** File the signal was read from, relative to the workspace. */
  source: string;
  /** Bounded, human-readable statement of what was found. */
  evidence: string;
  confidence: 'low' | 'medium' | 'high';
  affectedService?: string;
}

/** Longest evidence string kept; a signal is a pointer, not a quote. */
const MAX_EVIDENCE_LENGTH = 160;

/** Largest file the detectors will read. */
const MAX_FILE_BYTES = 256 * 1024;

/** Bounds for the source walk (sqlite / custom server detection). */
const MAX_WALK_FILES = 400;
const MAX_WALK_DEPTH = 4;

/** Directories that cannot hold runtime code worth scanning. */
const SKIP_DIRS = new Set([
  'node_modules',
  'vendor',
  'dist',
  'build',
  'out',
  'coverage',
  'target',
  '__pycache__',
  '.git',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.vercel',
  '.venv',
  'venv',
]);

/** Test/fixture directories: sqlite in a test is not runtime sqlite. */
const TEST_DIRS = new Set([
  'test',
  'tests',
  '__tests__',
  'spec',
  'specs',
  'fixtures',
  '__fixtures__',
  'e2e',
  'mocks',
  '__mocks__',
]);

const SOURCE_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.mts',
  '.py',
]);

export async function detectMigrationSignals(
  cwd: string,
  options: {
    /** Directories to probe for manifests, `.` meaning the root. */
    dirs: string[];
    /** Deployment-intent files already found, relative to the workspace. */
    intentFiles: string[];
  }
): Promise<MigrationSignal[]> {
  const signals: MigrationSignal[] = [];

  const composeFiles = options.intentFiles.filter(file =>
    /(^|\/)(docker-)?compose\.ya?ml$/.test(file)
  );
  const procfiles = options.intentFiles.filter(file =>
    /(^|\/)Procfile$/.test(file)
  );
  const nginxFiles = options.intentFiles.filter(file =>
    /(^|\/)(nginx\.conf|default\.conf)$/.test(file)
  );
  const caddyFiles = options.intentFiles.filter(file =>
    /(^|\/)Caddyfile$/.test(file)
  );

  const detectors: Array<Promise<void>> = [
    ...composeFiles.map(file =>
      guard('compose', () => detectFromCompose(cwd, file, signals))
    ),
    ...procfiles.map(file =>
      guard('procfile', () => detectFromProcfile(cwd, file, signals))
    ),
    ...nginxFiles.map(file =>
      guard('nginx', () => detectFromNginx(cwd, file, signals))
    ),
    ...caddyFiles.map(file =>
      guard('caddy', () => detectFromCaddyfile(cwd, file, signals))
    ),
    guard('manifests', () => detectFromManifests(cwd, options.dirs, signals)),
    guard('sources', () => detectFromSources(cwd, signals)),
  ];
  await Promise.all(detectors);

  // Code-unit ordering, not locale collation: the order must be identical
  // on every machine that runs the same repo.
  return dedupe(signals).sort(
    (a, b) =>
      compare(a.kind, b.kind) ||
      compare(a.source, b.source) ||
      compare(a.evidence, b.evidence)
  );
}

/** A detector failure costs its own facts, never the analysis. */
async function guard(what: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    output.debug(
      `onboard signals: ${what} detector failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// --- docker compose --------------------------------------------------------

interface ComposeService {
  image?: unknown;
  command?: unknown;
  entrypoint?: unknown;
  ports?: unknown;
  volumes?: unknown;
}

const DB_IMAGE = /postgres|postgis|mysql|mariadb|mongo|redis|clickhouse/i;
const WORKER_NAME = /worker|consumer|celery|beat|queue|scheduler/i;

async function detectFromCompose(
  cwd: string,
  file: string,
  signals: MigrationSignal[]
): Promise<void> {
  const raw = await readBounded(join(cwd, file));
  if (!raw) return;
  const doc = yaml.load(raw);
  if (!isRecord(doc) || !isRecord(doc.services)) return;

  const services = doc.services as Record<string, ComposeService>;
  const namedVolumes = new Set(
    isRecord(doc.volumes) ? Object.keys(doc.volumes) : []
  );

  // Which service mounts which named volume.
  const mounts = new Map<string, string[]>();
  for (const [name, service] of Object.entries(services)) {
    if (!isRecord(service)) continue;
    for (const volumeName of namedVolumeMounts(service.volumes, namedVolumes)) {
      const list = mounts.get(volumeName) ?? [];
      list.push(name);
      mounts.set(volumeName, list);
    }
  }

  for (const [volumeName, mountedBy] of mounts) {
    if (mountedBy.length >= 2) {
      signals.push({
        kind: 'shared-volume',
        source: file,
        evidence: `Named volume \`${volumeName}\` mounted by ${mountedBy
          .map(name => `\`${name}\``)
          .join(' and ')}`,
        confidence: 'high',
      });
    }
  }

  for (const [name, service] of Object.entries(services)) {
    if (!isRecord(service)) continue;
    const image = typeof service.image === 'string' ? service.image : '';
    const command = commandText(service.command ?? service.entrypoint);
    const hasVolumes =
      Array.isArray(service.volumes) && service.volumes.length > 0;

    if (DB_IMAGE.test(image) && hasVolumes) {
      signals.push({
        kind: 'database-volume',
        source: file,
        evidence: `Database service \`${name}\` (${image}) persists to a volume`,
        confidence: 'high',
        affectedService: name,
      });
    }

    // A service that is not a database, exposes no ports, and is named or
    // commanded like a worker is a resident process the request path will
    // not start.
    const exposesPorts =
      Array.isArray(service.ports) && service.ports.length > 0;
    const looksLikeWorker =
      WORKER_NAME.test(name) || /\bworker\b|celery/i.test(command);
    if (!DB_IMAGE.test(image) && !exposesPorts && looksLikeWorker) {
      signals.push({
        kind: 'resident-worker',
        source: file,
        evidence: command
          ? `Service \`${name}\` runs \`${bound(command)}\` with no ports`
          : `Service \`${name}\` has no ports and a worker-shaped name`,
        confidence: 'high',
        affectedService: name,
      });
    }

    if (/\bcron\b|crond/i.test(command)) {
      signals.push({
        kind: 'scheduler',
        source: file,
        evidence: `Service \`${name}\` runs \`${bound(command)}\``,
        confidence: 'high',
        affectedService: name,
      });
    }
  }
}

/** Named-volume mounts of one service, in either compose syntax. */
function namedVolumeMounts(volumes: unknown, declared: Set<string>): string[] {
  if (!Array.isArray(volumes)) return [];
  const names: string[] = [];
  for (const entry of volumes) {
    if (typeof entry === 'string') {
      const name = entry.split(':')[0];
      // Bind mounts start with `.`, `/`, `~`; named volumes are bare names.
      if (
        name &&
        !/^[./~]/.test(name) &&
        (declared.has(name) || declared.size === 0)
      ) {
        names.push(name);
      }
    } else if (
      isRecord(entry) &&
      entry.type === 'volume' &&
      typeof entry.source === 'string'
    ) {
      names.push(entry.source);
    }
  }
  return names;
}

function commandText(command: unknown): string {
  if (typeof command === 'string') return command;
  if (Array.isArray(command)) return command.map(String).join(' ');
  return '';
}

// --- Procfile ---------------------------------------------------------------

async function detectFromProcfile(
  cwd: string,
  file: string,
  signals: MigrationSignal[]
): Promise<void> {
  const raw = await readBounded(join(cwd, file));
  if (!raw) return;
  for (const line of raw.split('\n')) {
    const match = /^([A-Za-z0-9_-]+):\s*(.+)$/.exec(line.trim());
    if (!match) continue;
    const [, name, command] = match;
    if (name === 'web') continue;
    const kind: MigrationSignalKind = /clock|cron|schedul/i.test(name)
      ? 'scheduler'
      : 'resident-worker';
    signals.push({
      kind,
      source: file,
      evidence: `Process \`${name}\` runs \`${bound(command)}\``,
      confidence: 'high',
      affectedService: name,
    });
  }
}

// --- nginx / Caddy -----------------------------------------------------------

async function detectFromNginx(
  cwd: string,
  file: string,
  signals: MigrationSignal[]
): Promise<void> {
  const raw = await readBounded(join(cwd, file));
  if (!raw) return;
  // `location <path> { ... proxy_pass <target>; ... }`, brace-free bodies
  // only — nested blocks are rare in the files this aims at, and a partial
  // read must never invent a route.
  const pattern =
    /location\s+(?:[=~^*]+\s+)?(\S+)\s*\{[^{}]*?proxy_pass\s+([^;\s]+)/g;
  for (const match of raw.matchAll(pattern)) {
    const [, route, target] = match;
    signals.push({
      kind: 'reverse-proxy-route',
      source: file,
      evidence: `Route \`${route}\` proxies to \`${target}\``,
      confidence: 'high',
    });
  }
}

async function detectFromCaddyfile(
  cwd: string,
  file: string,
  signals: MigrationSignal[]
): Promise<void> {
  const raw = await readBounded(join(cwd, file));
  if (!raw) return;
  for (const line of raw.split('\n')) {
    const match = /^\s*reverse_proxy\s+(\S+)(?:\s+(\S+))?/.exec(line);
    if (!match) continue;
    // `reverse_proxy [matcher] target` — with one argument it is the target.
    const [, first, second] = match;
    const route = second ? first : '*';
    const target = second ?? first;
    signals.push({
      kind: 'reverse-proxy-route',
      source: file,
      evidence: `Route \`${route}\` proxies to \`${target}\``,
      // Caddy matchers can live on surrounding lines this reader ignores.
      confidence: 'medium',
    });
  }
}

// --- dependency manifests -----------------------------------------------------

const SCHEDULER_DEPS = ['node-cron', 'cron', 'node-schedule', 'agenda', 'bree'];
const QUEUE_DEPS = ['bullmq', 'bull', 'bee-queue'];
const WEBSOCKET_DEPS = ['socket.io', 'ws'];
const SQLITE_DEPS = ['better-sqlite3', 'sqlite3', 'sqlite'];
const SESSION_STORES = [
  'connect-redis',
  'connect-pg-simple',
  'connect-mongo',
  'connect-sqlite3',
  'memorystore',
  '@upstash/redis',
];

async function detectFromManifests(
  cwd: string,
  dirs: string[],
  signals: MigrationSignal[]
): Promise<void> {
  for (const dir of dirs) {
    const prefix = dir === '.' ? '' : `${dir}/`;

    const packageJson = await readBounded(
      join(cwd, prefix, 'package.json')
    ).catch(() => undefined);
    if (packageJson) {
      let manifest: unknown;
      try {
        manifest = JSON.parse(packageJson);
      } catch {
        continue;
      }
      if (!isRecord(manifest)) continue;
      const deps = {
        ...(isRecord(manifest.dependencies) ? manifest.dependencies : {}),
      };
      const has = (name: string) => name in deps;
      const source = `${prefix}package.json`;

      for (const dep of SCHEDULER_DEPS.filter(has)) {
        signals.push({
          kind: 'scheduler',
          source,
          evidence: `Depends on \`${dep}\``,
          confidence: 'medium',
        });
      }
      for (const dep of QUEUE_DEPS.filter(has)) {
        signals.push({
          kind: 'resident-worker',
          source,
          evidence: `Depends on \`${dep}\` (queue consumers are resident processes)`,
          confidence: 'medium',
        });
      }
      for (const dep of SQLITE_DEPS.filter(has)) {
        signals.push({
          kind: 'sqlite-runtime',
          source,
          evidence: `Depends on \`${dep}\``,
          confidence: 'high',
        });
      }
      if (has('express-session') && !SESSION_STORES.some(has)) {
        signals.push({
          kind: 'memory-session-store',
          source,
          evidence:
            'Depends on `express-session` with no external session-store package',
          confidence: 'medium',
        });
      }
      for (const dep of WEBSOCKET_DEPS.filter(has)) {
        signals.push({
          kind: 'websocket',
          source,
          evidence: `Depends on \`${dep}\``,
          confidence: 'medium',
        });
      }
    }

    // Python: requirements.txt and pyproject.toml, read as text — names are
    // enough, and a TOML parser is not worth the dependency.
    for (const name of ['requirements.txt', 'pyproject.toml']) {
      const raw = await readBounded(join(cwd, prefix, name)).catch(
        () => undefined
      );
      if (!raw) continue;
      const source = `${prefix}${name}`;
      if (/^\s*apscheduler\b/im.test(raw) || /"apscheduler/i.test(raw)) {
        signals.push({
          kind: 'scheduler',
          source,
          evidence: 'Depends on `APScheduler`',
          confidence: 'medium',
        });
      }
      if (/^\s*celery\b/im.test(raw) || /"celery/i.test(raw)) {
        signals.push({
          kind: 'resident-worker',
          source,
          evidence: 'Depends on `celery` (workers are resident processes)',
          confidence: 'medium',
        });
      }
    }
  }
}

// --- source walk (sqlite usage, custom server) -------------------------------

const SQLITE_IMPORT =
  /(?:require\(\s*|from\s+|import\s+)['"](?:better-sqlite3|sqlite3|sqlite|node:sqlite)['"]|import\s+sqlite3\b|sqlite:\/\//;
const SOCKET_IMPORT = /['"](?:socket\.io|ws)['"]/;
const SERVER_SHAPE =
  /http\.createServer|createServer\(|express\(\)|fastify\(|new Hono|next\(\{/;

async function detectFromSources(
  cwd: string,
  signals: MigrationSignal[]
): Promise<void> {
  const files = await walkSources(cwd);

  for (const file of files) {
    const raw = await readBounded(join(cwd, file)).catch(() => undefined);
    if (!raw) continue;

    if (SQLITE_IMPORT.test(raw)) {
      const line = firstMatchingLine(raw, SQLITE_IMPORT);
      signals.push({
        kind: 'sqlite-runtime',
        source: file,
        evidence: `Runtime SQLite usage: \`${bound(line)}\``,
        confidence: 'high',
      });
    }

    // A root-level server file that both serves a framework/app and speaks
    // WebSocket is a custom server: the two behaviors deploy differently.
    const isServerFile = /(^|\/)server\.(js|mjs|cjs|ts|mts)$/.test(file);
    if (isServerFile && SOCKET_IMPORT.test(raw) && SERVER_SHAPE.test(raw)) {
      signals.push({
        kind: 'custom-server',
        source: file,
        evidence: 'Combines an HTTP server with a WebSocket server',
        confidence: 'high',
      });
      signals.push({
        kind: 'websocket',
        source: file,
        evidence: `WebSocket server: \`${bound(
          firstMatchingLine(raw, SOCKET_IMPORT)
        )}\``,
        confidence: 'high',
      });
    }
  }
}

/**
 * Bounded, deterministic walk: source files only, skipping dependency,
 * build, hidden, and test directories. Never reads `.env` files — nothing
 * here may put a secret into evidence.
 */
async function walkSources(cwd: string): Promise<string[]> {
  const found: string[] = [];
  const queue: Array<{ dir: string; depth: number }> = [{ dir: '.', depth: 0 }];

  while (queue.length > 0 && found.length < MAX_WALK_FILES) {
    const { dir, depth } = queue.shift() as { dir: string; depth: number };
    let entries;
    try {
      entries = await readdir(join(cwd, dir), { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => compare(a.name, b.name));
    for (const entry of entries) {
      const relative = dir === '.' ? entry.name : `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (
          depth < MAX_WALK_DEPTH &&
          !entry.name.startsWith('.') &&
          !SKIP_DIRS.has(entry.name) &&
          !TEST_DIRS.has(entry.name)
        ) {
          queue.push({ dir: relative, depth: depth + 1 });
        }
        continue;
      }
      const ext = entry.name.slice(entry.name.lastIndexOf('.'));
      if (!SOURCE_EXTENSIONS.has(ext)) continue;
      if (/\.(test|spec)\./.test(entry.name)) continue;
      found.push(relative);
      if (found.length >= MAX_WALK_FILES) break;
    }
  }
  return found;
}

// --- rendering ----------------------------------------------------------------

/**
 * The preflight block. States facts and demands accounting; never claims a
 * signal is impossible to support.
 */
export function formatMigrationSignals(
  signals: MigrationSignal[]
): string | undefined {
  if (signals.length === 0) return undefined;
  const lines = [
    '  - Migration signals — runtime semantics read from this repo’s own files.',
    '    Each is a fact with its source; the migration plan must account for',
    '    every one of them (they are risks to address, not verdicts):',
    ...signals.map(
      signal =>
        `    - [${signal.confidence}] ${signal.evidence} (${signal.source})`
    ),
  ];
  return lines.join('\n');
}

/**
 * The signals a generated `services` config does not express: everything
 * except request routing. Routing signals still need comparing against the
 * config's rewrites — the caller says so — but state, workers, schedulers,
 * sockets, and sessions are never covered by it.
 */
export function unresolvedByProposedConfig(
  signals: MigrationSignal[]
): MigrationSignal[] {
  return signals.filter(signal => signal.kind !== 'reverse-proxy-route');
}

// --- helpers -------------------------------------------------------------------

async function readBounded(path: string): Promise<string | undefined> {
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size > MAX_FILE_BYTES) return undefined;
    return await readFile(path, 'utf-8');
  } catch {
    return undefined;
  }
}

function firstMatchingLine(raw: string, pattern: RegExp): string {
  for (const line of raw.split('\n')) {
    if (pattern.test(line)) return line.trim();
  }
  return '';
}

function bound(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length <= MAX_EVIDENCE_LENGTH
    ? collapsed
    : `${collapsed.slice(0, MAX_EVIDENCE_LENGTH - 1)}…`;
}

function dedupe(signals: MigrationSignal[]): MigrationSignal[] {
  const seen = new Set<string>();
  return signals.filter(signal => {
    const key = `${signal.kind}\u0000${signal.source}\u0000${signal.evidence}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
