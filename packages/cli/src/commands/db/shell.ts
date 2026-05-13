import { spawn } from 'node:child_process';
import { basename } from 'node:path';
import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import parseTarget from '../../util/parse-target';
import { validateJsonOutput } from '../../util/output-format';
import { resolveDatabaseScope } from '../../util/db/resolve-scope';
import {
  assertSessionTtl,
  confirmProductionWrite,
  parseDatabaseRole,
} from '../../util/db/validate';
import { shellSubcommand } from './command';
import type {
  DatabaseRole,
  DatabaseSessionRequest,
  DatabaseSessionResponse,
} from './types';
import { DB_SESSIONS_API_PATH, getDatabaseApiErrorMessage } from './api';

export default async function shell(
  client: Client,
  argv: string[]
): Promise<number> {
  const flagsSpecification = getFlagsSpecification(shellSubcommand.options);

  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    output.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }

  let role: DatabaseRole;
  try {
    role = parseDatabaseRole(parsedArgs.flags['--role']);
  } catch (err) {
    output.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  if (!assertSessionTtl(parsedArgs.flags['--ttl'])) {
    return 1;
  }

  const environment =
    parseTarget({ flagName: 'environment', flags: parsedArgs.flags }) ||
    'development';

  const confirmation = await confirmProductionWrite(client, {
    environment,
    role,
    confirmed: parsedArgs.flags['--confirm-production-write'],
    reason: parsedArgs.flags['--reason'],
  });
  if (confirmation === 'invalid') {
    return 1;
  }
  if (confirmation === 'canceled') {
    output.log('Canceled. No database session was created.');
    return 0;
  }

  const scope = await resolveDatabaseScope(
    client,
    parsedArgs.flags['--project']
  );
  if (typeof scope === 'number') {
    return scope;
  }

  const body: DatabaseSessionRequest = {
    projectId: scope.projectId,
    environment,
    resourceIdOrName: parsedArgs.flags['--resource'],
    role,
    ttl: parsedArgs.flags['--ttl'],
    reason: parsedArgs.flags['--reason'],
  };

  output.spinner('Creating secure database session');
  let response: DatabaseSessionResponse;
  try {
    response = await client.fetch<DatabaseSessionResponse>(
      DB_SESSIONS_API_PATH,
      {
        method: 'POST',
        accountId: scope.accountId,
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    output.error(getDatabaseApiErrorMessage(err));
    return 1;
  } finally {
    output.stopSpinner();
  }

  if (formatResult.jsonOutput) {
    const safeResponse = {
      sessionId: response.sessionId,
      expiresAt: response.expiresAt,
      auditId: response.auditId,
    };
    client.stdout.write(`${JSON.stringify(safeResponse, null, 2)}\n`);
    return 0;
  }

  output.log(
    `Created ${chalk.bold(role)} database session for ${chalk.bold(scope.projectName)} (${environment}).`
  );
  output.log(`Session expires: ${chalk.cyan(response.expiresAt)}`);
  if (response.auditId) {
    output.log(`Audit ID: ${chalk.cyan(response.auditId)}`);
  }

  if (!response.command) {
    output.log(
      'The database provider did not return an interactive shell command for this session.'
    );
    return 0;
  }

  return runShellCommand(
    response.command.executable,
    response.command.args,
    buildShellEnv(response.command.env)
  );
}

function buildShellEnv(providerEnv: Record<string, string> = {}) {
  const inheritedKeys = [
    'PATH',
    'HOME',
    'TERM',
    'USER',
    'LANG',
    'LC_ALL',
    'COLUMNS',
    'LINES',
  ];
  const env: NodeJS.ProcessEnv = {};
  for (const key of inheritedKeys) {
    if (process.env[key]) {
      env[key] = process.env[key];
    }
  }

  for (const [key, value] of Object.entries(providerEnv)) {
    if (!inheritedKeys.includes(key)) {
      env[key] = value;
    }
  }

  return env;
}

function runShellCommand(
  executable: string,
  args: string[],
  env: NodeJS.ProcessEnv
): Promise<number> {
  if (!isAllowedShellExecutable(executable)) {
    output.error(
      `Refusing to start unsupported database shell executable: ${executable}`
    );
    return Promise.resolve(1);
  }

  return new Promise(resolve => {
    const child = spawn(executable, args, {
      stdio: 'inherit',
      env,
    });

    child.on('error', err => {
      output.error(`Failed to start database shell: ${err.message}`);
      resolve(1);
    });

    child.on('close', code => resolve(code ?? 0));
  });
}

function isAllowedShellExecutable(executable: string): boolean {
  if (executable !== basename(executable)) {
    return false;
  }

  return new Set(['psql', 'mysql', 'mariadb']).has(executable);
}
