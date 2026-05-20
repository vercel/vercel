import { loadEnvConfig } from '@next/env';
import execa from 'execa';
import { randomBytes } from 'node:crypto';
import {
  dirname,
  join,
  parse as parsePath,
  resolve as resolvePath,
} from 'node:path';
import { existsSync } from 'node:fs';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { proxySubcommand, type runSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { startBroker } from './broker-service';
import {
  buildLocalPostgresUrl,
  isPostgresUrl,
  startPostgresProxy,
  type PostgresProxy,
} from './broker-service/postgres';
import { getLinkedProject } from '../../util/projects/link';
import {
  pullEnvRecords,
  type EnvRecordsSource,
} from '../../util/env/get-env-records';
import parseTarget from '../../util/parse-target';
import { getCommandName } from '../../util/pkg-name';

function parseProxyArgs(argv: string[]) {
  const i = argv.indexOf('--');
  const hasDoubleDash = i !== -1;
  const vercelArgs = hasDoubleDash ? argv.slice(2, i) : argv.slice(2);
  const userCommand = hasDoubleDash ? argv.slice(i + 1) : [];
  return { vercelArgs, userCommand };
}

export function needsHelpForProxy(client: Client): boolean {
  const { vercelArgs } = parseProxyArgs(client.argv);
  const flags = getFlagsSpecification(proxySubcommand.options);
  try {
    return Boolean(parseArguments(vercelArgs, flags).flags['--help']);
  } catch {
    return false;
  }
}

// Walk up from __dirname looking for the compiled shim (built from proxy-shim.ts).
// - production: dist/commands/env/proxy-shim.cjs (next to compiled env command)
// - tests: packages/cli/dist/commands/env/proxy-shim.cjs after build
function findShimPath(): string | null {
  const candidates = [
    join(__dirname, 'proxy-shim.cjs'),
    join(
      __dirname,
      '..',
      '..',
      '..',
      'dist',
      'commands',
      'env',
      'proxy-shim.cjs'
    ),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // Last resort: walk up looking for dist/commands/env/proxy-shim.cjs.
  let dir = __dirname;
  const { root } = parsePath(dir);
  while (dir !== root) {
    const p = resolvePath(dir, 'dist', 'commands', 'env', 'proxy-shim.cjs');
    if (existsSync(p)) return p;
    dir = dirname(dir);
  }
  return null;
}

// Matches a value that starts with an URL-style `scheme://` prefix. Many
// client libraries (libsql, pg, redis, mongo, ...) validate the URL shape
// before opening a connection, so a plain `vproxy_..._xx` dummy fails fast
// with `URL_INVALID` and the request never reaches the broker. To keep the
// dummy substitutable but parseable, we mirror the scheme and embed the
// dummy token as a hostname.
const URL_LIKE_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//;

function makeDummy(key: string, real: string): string {
  const nonce = randomBytes(10).toString('hex');
  // Hostnames don't allow underscores in DNS, and some parsers reject them
  // even though WHATWG URL permits them. Use hyphens for the host label so
  // the dummy is a valid URL no matter who parses it.
  const slug = key.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const m = real.match(URL_LIKE_RE);
  if (m) {
    return `${m[1]}://vproxy-${slug}-${nonce}.xx`;
  }
  return `vproxy_${slug.replace(/-/g, '_')}_${nonce}_xx`;
}

function addSubstitution(
  dummyToReal: Map<string, string>,
  realToDummy: Map<string, string>,
  dummy: string,
  real: string,
  reverseSubMinLen: number
) {
  dummyToReal.set(dummy, real);
  if (real.length >= reverseSubMinLen) {
    realToDummy.set(real, dummy);
  }
}

function addUrlHostSubstitution(
  dummyToReal: Map<string, string>,
  realToDummy: Map<string, string>,
  hostAliases: Record<string, string>,
  dummy: string,
  real: string,
  reverseSubMinLen: number
) {
  let dummyUrl: URL;
  let realUrl: URL;
  try {
    dummyUrl = new URL(dummy);
    realUrl = new URL(real);
  } catch {
    return;
  }

  // Client libraries can parse a dummy URL and then transform the scheme before
  // making a network request. For example, @libsql/client turns
  // `libsql://dummy-host` into `https://dummy-host/v2/pipeline`. At that point
  // the original dummy string is gone, so also substitute the generated host.
  addSubstitution(
    dummyToReal,
    realToDummy,
    dummyUrl.host,
    realUrl.host,
    reverseSubMinLen
  );
  hostAliases[dummyUrl.host] = realUrl.host;
}

export default async function proxy(
  client: Client,
  opts: {
    subcommand?: typeof proxySubcommand | typeof runSubcommand;
    source?: EnvRecordsSource;
    missingCommandExample?: string;
  } = {}
): Promise<number> {
  const { vercelArgs, userCommand } = parseProxyArgs(client.argv);
  const subcommand = opts.subcommand ?? proxySubcommand;
  const source = opts.source ?? 'vercel-cli:env:proxy';

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      vercelArgs,
      getFlagsSpecification(subcommand.options)
    );
  } catch (e) {
    printError(e);
    return 1;
  }

  if (userCommand.length === 0) {
    output.error(
      'No command provided. Use `--` to separate vercel flags from your command. ' +
        `Example: \`${opts.missingCommandExample ?? 'vercel env proxy -- npm run dev'}\``
    );
    return 1;
  }

  const shimPath = findShimPath();
  if (!shimPath) {
    output.error(
      'Could not locate proxy shim. Did the CLI build complete? Expected proxy-shim.cjs next to the compiled env command.'
    );
    return 1;
  }

  // Resolve linked project so we can pull env vars (mirrors `vc env run`).
  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return link.exitCode;
  }
  if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn't linked to a project on Vercel. Run ${getCommandName('link')} to begin.`
    );
    return 1;
  }
  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  const environment =
    parseTarget({
      flagName: 'environment',
      flags: parsedArgs.flags,
    }) || 'development';
  const gitBranch = parsedArgs.flags['--git-branch'];

  output.spinner(`Downloading \`${environment}\` Environment Variables`);
  const records = await pullEnvRecords(client, link.project.id, source, {
    target: environment,
    gitBranch,
  });
  output.stopSpinner();

  // Each pulled secret becomes a dummy in the child; the real value stays in
  // the broker so the subprocess never sees it. Empty values get a dummy of ''
  // so they pass through unchanged.
  const dummyEnv: Record<string, string> = {};
  const dummyToReal = new Map<string, string>();
  const realToDummy = new Map<string, string>();
  const hostAliases: Record<string, string> = {};
  // Only reverse-substitute real values that are long enough to be unique.
  // A short value like `FLAG=1` would false-match every digit in responses.
  const REVERSE_SUB_MIN_LEN = 8;
  let substitutableCount = 0;
  for (const [key, real] of Object.entries(records.env)) {
    if (!real) {
      dummyEnv[key] = real;
      continue;
    }
    const dummy = makeDummy(key, real);
    dummyEnv[key] = dummy;
    addSubstitution(dummyToReal, realToDummy, dummy, real, REVERSE_SUB_MIN_LEN);
    addUrlHostSubstitution(
      dummyToReal,
      realToDummy,
      hostAliases,
      dummy,
      real,
      REVERSE_SUB_MIN_LEN
    );
    substitutableCount++;
  }

  const sessionId = randomBytes(16).toString('hex');
  const broker = await startBroker({
    subs: { dummyToReal, realToDummy },
    sessionId,
  });

  const postgresProxies: PostgresProxy[] = [];
  const postgresRealUrls = new Set<string>();
  for (const real of dummyToReal.values()) {
    if (isPostgresUrl(real)) postgresRealUrls.add(real);
  }
  for (const realUrl of postgresRealUrls) {
    const pgProxy = await startPostgresProxy({
      upstreamUrl: realUrl,
      subs: { dummyToReal, realToDummy },
    });
    postgresProxies.push(pgProxy);
    for (const [key, dummy] of Object.entries(dummyEnv)) {
      if (dummyToReal.get(dummy) === realUrl) {
        dummyEnv[key] = buildLocalPostgresUrl(pgProxy.port, dummy);
      }
    }
  }

  output.log(
    `Brokering ${substitutableCount} ${environment} Environment Variable${substitutableCount === 1 ? '' : 's'} via local broker on ${broker.url}` +
      (postgresProxies.length
        ? ` (${postgresProxies.length} Postgres listener${postgresProxies.length === 1 ? '' : 's'} on 127.0.0.1)`
        : '')
  );
  for (const key of Object.keys(records.env)) {
    output.debug(`  ${key} -> ${dummyEnv[key]}`);
  }

  const existingNodeOpts = process.env.NODE_OPTIONS ?? '';
  const requireFlag = `--require ${JSON.stringify(shimPath)}`;
  const nodeOptions = existingNodeOpts
    ? `${requireFlag} ${existingNodeOpts}`
    : requireFlag;

  // Local .env files and shell env override the brokered (dummy) values, just
  // like `vc env run` does. Anything the user set locally is assumed real and
  // passes straight through; it doesn't need brokering.
  let localEnv: Record<string, string | undefined> = {};
  try {
    localEnv = loadEnvConfig(client.cwd, true).combinedEnv;
  } catch (e) {
    output.debug(`Failed to load local env files: ${e}`);
  }

  try {
    const result = await execa(userCommand[0], userCommand.slice(1), {
      cwd: client.cwd,
      stdio: 'inherit',
      reject: false,
      env: {
        ...process.env,
        ...dummyEnv,
        ...localEnv,
        VC_ENV_PROXY_URL: broker.url,
        VC_ENV_PROXY_TCP_PORT: String(broker.tcpPort),
        VC_ENV_PROXY_HOST_ALIASES: JSON.stringify(hostAliases),
        VC_ENV_PROXY_SESSION: sessionId,
        NODE_OPTIONS: nodeOptions,
      },
    });

    if (result instanceof Error && typeof result.exitCode !== 'number') {
      output.prettyError(result);
      return 1;
    }
    return result.exitCode;
  } catch (e) {
    output.prettyError(e);
    return 1;
  } finally {
    await Promise.all(postgresProxies.map(proxy => proxy.close()));
    await broker.close();
  }
}
