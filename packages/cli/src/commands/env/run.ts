import { loadEnvConfig } from '@next/env';
import execa from 'execa';
import { existsSync } from 'node:fs';
import {
  dirname,
  join,
  parse as parsePath,
  resolve as resolvePath,
} from 'node:path';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { runSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getLinkedProject } from '../../util/projects/link';
import { pullEnvRecords } from '../../util/env/get-env-records';
import parseTarget from '../../util/parse-target';
import { getCommandName } from '../../util/pkg-name';
import {
  startBrokeredEnvService,
  type BrokeredEnvService,
} from './broker-service';

/**
 * Parses argv for the run subcommand, splitting on `--` to separate
 * vercel flags from the user's command.
 */
function parseRunArgs(argv: string[]) {
  const argvIndex = argv.indexOf('--');
  const hasDoubleDash = argvIndex !== -1;

  // Everything before '--' are the vercel env run flags
  const vercelArgs = hasDoubleDash ? argv.slice(2, argvIndex) : argv.slice(2);

  // Everything after '--' is the user's command
  const userCommand = hasDoubleDash ? argv.slice(argvIndex + 1) : [];

  return { vercelArgs, userCommand };
}

function findShimPath(): string | null {
  const candidates = [
    join(__dirname, 'broker-shim.cjs'),
    join(
      __dirname,
      '..',
      '..',
      '..',
      'dist',
      'commands',
      'env',
      'broker-shim.cjs'
    ),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  let dir = __dirname;
  const { root } = parsePath(dir);
  while (dir !== root) {
    const p = resolvePath(dir, 'dist', 'commands', 'env', 'broker-shim.cjs');
    if (existsSync(p)) return p;
    dir = dirname(dir);
  }
  return null;
}

/**
 * Checks if --help was passed in the vercel args (before `--`).
 * Used by the parent to handle help consistently with other subcommands.
 */
export function needsHelpForRun(client: Client): boolean {
  const { vercelArgs } = parseRunArgs(client.argv);
  const flagsSpecification = getFlagsSpecification(runSubcommand.options);

  try {
    const parsedArgs = parseArguments(vercelArgs, flagsSpecification);
    return Boolean(parsedArgs.flags['--help']);
  } catch {
    return false;
  }
}

export default async function run(client: Client): Promise<number> {
  const { vercelArgs, userCommand } = parseRunArgs(client.argv);

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(runSubcommand.options);

  try {
    parsedArgs = parseArguments(vercelArgs, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (userCommand.length === 0) {
    output.error(
      `No command provided. Use \`--\` to separate vercel flags from your command.`
    );
    return 1;
  }

  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn't linked to a project on Vercel. Run ${getCommandName(
        'link'
      )} to begin.`
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

  output.spinner(`Downloading \`${environment}\` environment variables`);

  const records = await pullEnvRecords(
    client,
    link.project.id,
    'vercel-cli:env:run',
    {
      target: environment,
      gitBranch,
    }
  );

  output.stopSpinner();

  output.debug(
    `Running command with ${Object.keys(records.env).length} environment variables`
  );

  let localEnv: Record<string, string | undefined> = {};
  try {
    localEnv = loadEnvConfig(client.cwd, true).combinedEnv;
  } catch (err) {
    output.debug(`Failed to load local env files: ${err}`);
  }

  let brokeredEnv: BrokeredEnvService | undefined;
  try {
    let env: Record<string, string | undefined> = {
      ...records.env,
      ...localEnv,
      ...process.env,
    };

    if (parsedArgs.flags['--experimental']) {
      const shimPath = findShimPath();
      if (!shimPath) {
        output.error(
          'Could not locate broker shim. Did the CLI build complete? Expected broker-shim.cjs next to the compiled env command.'
        );
        return 1;
      }

      // Local stand-in for the broker service boundary. In the service-backed
      // version, requests should go to the broker service with CLI auth instead
      // of brokering with real values in this process.
      brokeredEnv = await startBrokeredEnvService(records.env);
      output.log(
        `Brokering ${brokeredEnv.substitutableCount} ${environment} Environment Variable${brokeredEnv.substitutableCount === 1 ? '' : 's'} via local broker on ${brokeredEnv.broker.url}` +
          (brokeredEnv.postgresListenerCount
            ? ` (${brokeredEnv.postgresListenerCount} Postgres listener${brokeredEnv.postgresListenerCount === 1 ? '' : 's'} on 127.0.0.1)`
            : '')
      );
      for (const key of Object.keys(records.env)) {
        output.debug(`  ${key} -> ${brokeredEnv.env[key]}`);
      }

      const existingNodeOpts = process.env.NODE_OPTIONS ?? '';
      // Preload the shim in the child process so it can patch network APIs
      // before user code opens outbound connections.
      const requireFlag = `--require ${JSON.stringify(shimPath)}`;
      const nodeOptions = existingNodeOpts
        ? `${requireFlag} ${existingNodeOpts}`
        : requireFlag;

      env = {
        ...process.env,
        ...brokeredEnv.env,
        ...localEnv,
        // Shim routing metadata:
        // - URL: HTTP envelope broker endpoint.
        // - TCP_RELAY_PORT: raw TCP relay listener for dummy hostnames.
        // - HOST_ALIASES: dummy host -> real host map for URL-rewriting clients.
        // - LOCAL_TOKEN: local per-run bearer token for shim-to-broker requests.
        VC_ENV_BROKER_URL: brokeredEnv.broker.url,
        VC_ENV_BROKER_TCP_RELAY_PORT: String(brokeredEnv.broker.tcpPort),
        VC_ENV_BROKER_HOST_ALIASES: JSON.stringify(brokeredEnv.hostAliases),
        VC_ENV_BROKER_LOCAL_TOKEN: brokeredEnv.sessionId,
        NODE_OPTIONS: nodeOptions,
      };
    }

    const result = await execa(userCommand[0], userCommand.slice(1), {
      cwd: client.cwd,
      stdio: 'inherit',
      reject: false,
      env,
    });

    if (result instanceof Error && typeof result.exitCode !== 'number') {
      // Command does not exist or is not executable
      output.prettyError(result);
      return 1;
    }

    return result.exitCode;
  } catch (err: unknown) {
    output.prettyError(err);
    return 1;
  } finally {
    await brokeredEnv?.close();
  }
}
