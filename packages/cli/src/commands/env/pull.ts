import chalk from 'chalk';
import { outputFile, readFile } from 'fs-extra';
import { closeSync, openSync, readSync } from 'fs';
import { resolve } from 'path';
import type Client from '../../util/client';
import param from '../../util/output/param';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import getEnvRecords, {
  type EnvRecordsSource,
  pullEnvRecords,
} from '../../util/env/get-env-records';
import {
  buildDeltaString,
  createEnvObject,
} from '../../util/env/diff-env-files';
import { VERCEL_OIDC_TOKEN } from '../../util/env/constants';
import { updateOidcTokenContents } from '../../util/env/update-oidc-token-contents';
import { isErrnoException } from '@vercel/error-utils';
import { addToGitIgnore } from '../../util/link/add-to-gitignore';
import JSONparse from 'json-parse-better-errors';
import { formatProject } from '../../util/projects/format-project';
import type { ProjectLinked } from '@vercel-internals/types';
import output from '../../output-manager';
import { EnvPullTelemetryClient } from '../../util/telemetry/commands/env/pull';
import { pullSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import parseTarget from '../../util/parse-target';
import { resolveProjectContext } from '../../util/projects/resolve-project-context';
import getDeployment from '../../util/get-deployment';
import { isAPIError } from '../../util/errors-ts';
import { performDeviceCodeFlow } from '../login/future';
import {
  buildCommandWithYes,
  getPreservedArgsForEnvPull,
  outputActionRequired,
  outputAgentError,
} from '../../util/agent-output';
import { printAlignedLabel } from '../../util/output/print-aligned-label';

const CONTENTS_PREFIX = '# Created by Vercel CLI\n';

export interface EnvPullOptions {
  /** Refresh only VERCEL_OIDC_TOKEN while preserving all other file content. */
  oidcTokenOnly?: boolean;
}

function readHeadSync(path: string, length: number) {
  const buffer = Buffer.alloc(length);
  const fd = openSync(path, 'r');
  try {
    readSync(
      fd,
      buffer as unknown as NodeJS.ArrayBufferView,
      0,
      buffer.length,
      null
    );
  } finally {
    closeSync(fd);
  }
  return buffer.toString();
}

function tryReadHeadSync(path: string, length: number) {
  try {
    return readHeadSync(path, length);
  } catch (err: unknown) {
    if (!isErrnoException(err) || err.code !== 'ENOENT') {
      throw err;
    }
  }
}

const VARIABLES_TO_IGNORE = [
  'VERCEL_ANALYTICS_ID',
  'VERCEL_SPEED_INSIGHTS_ID',
  'VERCEL_WEB_ANALYTICS_ID',
];

export const SENSITIVE_PLACEHOLDER = '[SENSITIVE]';

async function getRedactedSensitiveKeys(
  client: Client,
  projectId: string | undefined,
  source: EnvRecordsSource,
  target: string,
  gitBranch: string | undefined,
  records: Record<string, string>
): Promise<Set<string>> {
  const emptyKeys = Object.keys(records).filter(key => !records[key]);
  if (!projectId || emptyKeys.length === 0) {
    return new Set();
  }
  try {
    const { envs } = await getEnvRecords(client, projectId, source, {
      target,
      gitBranch,
    });
    const sensitiveKeys = new Set(
      envs.filter(env => env.type === 'sensitive').map(env => env.key)
    );
    return new Set(emptyKeys.filter(key => sensitiveKeys.has(key)));
  } catch {
    return new Set();
  }
}

export default async function pull(
  client: Client,
  argv: string[],
  source: EnvRecordsSource = 'vercel-cli:env:pull',
  options: EnvPullOptions = {}
) {
  const telemetryClient = new EnvPullTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(pullSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags: opts } = parsedArgs;

  if (args.length > 1) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(`env pull <file>`)}`
    );
    return 1;
  }

  // handle relative or absolute filename
  const [rawFilename] = args;
  const filename = rawFilename || '.env.local';
  const skipConfirmation = opts['--yes'];
  const gitBranch = opts['--git-branch'];

  telemetryClient.trackCliArgumentFilename(args[0]);
  telemetryClient.trackCliFlagYes(skipConfirmation);
  telemetryClient.trackCliOptionGitBranch(gitBranch);
  telemetryClient.trackCliOptionEnvironment(opts['--environment']);
  telemetryClient.trackCliOptionId(opts['--id']);
  telemetryClient.trackCliOptionProject(opts['--project']);

  const link = await resolveProjectContext({
    client,
    projectNameOrId: opts['--project'],
  });
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    if (client.nonInteractive) {
      const preserved = getPreservedArgsForEnvPull(client.argv);
      const linkArgv = [
        ...client.argv.slice(0, 2),
        'link',
        '--scope',
        '<scope>',
        ...preserved,
      ];
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'not_linked',
          message: `Your codebase isn't linked to a project on Vercel. Run ${getCommandNamePlain(
            'link'
          )} to begin. Use --yes for non-interactive; use --scope or --project to specify team or project.`,
          next: [
            { command: buildCommandWithYes(linkArgv) },
            { command: buildCommandWithYes(client.argv) },
          ],
        },
        1
      );
    }
    output.error(
      `Your codebase isn’t linked to a project on Vercel. Run ${getCommandName(
        'link'
      )} to begin.`
    );
    return 1;
  }
  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  const deploymentId = opts['--id'];

  if (deploymentId && opts['--project']) {
    const deployment = await getDeployment(client, link.org.slug, deploymentId);
    if (deployment.projectId && deployment.projectId !== link.project.id) {
      output.error(
        `Deployment ${chalk.bold(deploymentId)} does not belong to project ${chalk.bold(link.project.name)}.`
      );
      return 1;
    }
  }

  const environment =
    parseTarget({
      flagName: 'environment',
      flags: opts,
    }) || 'development';

  await envPullCommandLogic(
    client,
    filename,
    !!skipConfirmation,
    environment,
    link,
    gitBranch,
    client.cwd,
    source,
    deploymentId,
    options
  );

  return 0;
}

export async function envPullCommandLogic(
  client: Client,
  filename: string,
  skipConfirmation: boolean,
  environment: string,
  link: ProjectLinked,
  gitBranch: string | undefined,
  cwd: string,
  source: EnvRecordsSource,
  deploymentId?: string,
  { oidcTokenOnly = false }: EnvPullOptions = {}
) {
  const fullPath = resolve(cwd, filename);
  const head = tryReadHeadSync(fullPath, Buffer.byteLength(CONTENTS_PREFIX));
  const exists = typeof head !== 'undefined';

  if (head === CONTENTS_PREFIX && !oidcTokenOnly) {
    output.log(`Overwriting existing ${chalk.bold(filename)} file`);
  } else if (exists && !skipConfirmation && !oidcTokenOnly) {
    if (client.nonInteractive) {
      const preserved = getPreservedArgsForEnvPull(client.argv).filter(
        arg => arg !== '--yes' && arg !== '-y'
      );
      const suffix = preserved.length > 0 ? ` ${preserved.join(' ')}` : '';
      outputActionRequired(client, {
        status: 'action_required',
        reason: 'env_file_exists',
        message: `File ${param(filename)} already exists and was not created by Vercel CLI. Use --yes to overwrite or specify a different filename.`,
        next: [
          {
            command: getCommandNamePlain(`env pull ${filename} --yes${suffix}`),
            when: 'Overwrite this file',
          },
          {
            command: getCommandNamePlain(`env pull <filename>${suffix}`),
            when: 'Use a different filename',
          },
        ],
      });
    }
    if (
      !(await client.input.confirm(
        `Found existing file ${param(filename)}. Do you want to overwrite?`,
        false
      ))
    ) {
      output.log('Canceled');
      return;
    }
  }

  const projectSlugLink = formatProject(link.org.slug, link.project.name);

  const downloadMessage = oidcTokenOnly
    ? `Downloading a fresh \`${chalk.cyan(
        VERCEL_OIDC_TOKEN
      )}\` for ${projectSlugLink}`
    : gitBranch
      ? `Downloading \`${chalk.cyan(
          environment
        )}\` environment variables for ${projectSlugLink} and any overrides for branch ${chalk.cyan(
          gitBranch
        )}`
      : `Downloading \`${chalk.cyan(
          environment
        )}\` environment variables for ${projectSlugLink}`;

  output.log(downloadMessage);

  output.spinner('Downloading');

  const pullId = deploymentId || link.project.id;
  const pullResult = await pullEnvRecordsForEnvPull(client, pullId, source, {
    target: environment || 'development',
    gitBranch,
  });
  // When pulling by deployment ID, use buildEnv which always contains the full
  // set of env vars. The `env` dict may only contain decryption keys when large
  // env encryption is active (the actual values are in an encrypted blob for
  // Lambda runtime use).
  const records = deploymentId ? pullResult.buildEnv : pullResult.env;

  let deltaString = '';
  let oldEnv;
  if (exists && !oidcTokenOnly) {
    oldEnv = await createEnvObject(fullPath);
  }

  let contents: string;
  let fileChanged = true;
  const keptLocalKeys: string[] = [];

  if (oidcTokenOnly) {
    const existingContents = exists ? await readFile(fullPath, 'utf8') : '';
    contents = updateOidcTokenContents(
      existingContents,
      records[VERCEL_OIDC_TOKEN] || undefined
    );
    fileChanged = contents !== existingContents;
  } else {
    const sensitiveKeys = await getRedactedSensitiveKeys(
      client,
      deploymentId ? undefined : link.project.id,
      source,
      environment,
      gitBranch,
      records
    );

    const mergedRecords: Record<string, string | undefined> = { ...records };
    for (const key of sensitiveKeys) {
      mergedRecords[key] = SENSITIVE_PLACEHOLDER;
    }
    if (oldEnv) {
      for (const [key, value] of Object.entries(oldEnv)) {
        if (
          !(key in mergedRecords) &&
          key !== VERCEL_OIDC_TOKEN &&
          !VARIABLES_TO_IGNORE.includes(key)
        ) {
          mergedRecords[key] = value;
          keptLocalKeys.push(key);
        }
      }
    }

    contents =
      CONTENTS_PREFIX +
      Object.keys(mergedRecords)
        .sort()
        .filter(key => !VARIABLES_TO_IGNORE.includes(key))
        .map(key => `${key}="${escapeValue(mergedRecords[key])}"`)
        .join('\n') +
      '\n';

    if (oldEnv) {
      const newEnv = JSONparse(
        JSON.stringify(mergedRecords).replace(/\\"/g, '')
      );
      deltaString = buildDeltaString(oldEnv, newEnv);
    }
  }

  if (fileChanged) {
    await outputFile(fullPath, contents, 'utf8');
  }

  if (deltaString) {
    output.print('\n' + deltaString);
  } else if (oldEnv && exists) {
    output.log('No changes found.');
  }

  if (keptLocalKeys.length > 0) {
    output.log(
      `Kept ${keptLocalKeys
        .sort()
        .map(key => chalk.bold(key))
        .join(', ')} (defined locally, not found in the ${chalk.cyan(
        environment
      )} Environment)`
    );
  }

  let isGitIgnoreUpdated = false;
  const fileExistsAfterPull = exists || contents.length > 0;
  if (filename === '.env.local' && fileExistsAfterPull) {
    // When the file is `.env.local`, we also add it to `.gitignore`
    // to avoid accidentally committing it to git.
    // We use '.env*' to match the default .gitignore from
    // create-next-app template. See:
    // https://github.com/vercel/next.js/commit/09a385669b3757ef59065138901eb3084d35d418
    const rootPath = link.repoRoot ?? cwd;
    isGitIgnoreUpdated = await addToGitIgnore(rootPath, '.env*');
  }

  if (!fileChanged && !isGitIgnoreUpdated) {
    output.stopSpinner();
    return;
  }

  output.print('\n');
  if (!fileChanged) {
    printAlignedLabel('Updated', `.gitignore for ${filename}`, { gutter: '✓' });
    return;
  }
  printAlignedLabel(
    exists ? 'Updated' : 'Created',
    `${filename} file${isGitIgnoreUpdated ? ' and added it to .gitignore' : ''}`,
    { gutter: '✓' }
  );
}

async function pullEnvRecordsForEnvPull(
  client: Client,
  pullId: string,
  source: EnvRecordsSource,
  options: { target: string; gitBranch?: string }
) {
  try {
    return await pullEnvRecords(client, pullId, source, options);
  } catch (error) {
    if (!isAPIError(error) || error.code !== 'challenge_required') {
      throw error;
    }

    const refreshToken = client.authConfig.refreshToken;
    if (!refreshToken || client.authConfig.tokenSource || !client.stdin.isTTY) {
      throw error;
    }

    output.stopSpinner();
    output.log('Sensitive Environment Variables require fresh authentication.');

    const acrValues = getAcrValuesFromWWWAuthenticate(error.wwwAuthenticate);
    if (!acrValues) {
      throw error;
    }

    const tokens = await performDeviceCodeFlow(client, {
      refreshToken,
      acrValues,
    });
    if (!tokens) {
      throw error;
    }

    client.updateAuthConfig({
      token: tokens.access_token,
      userId: undefined,
      expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
    });
    if (tokens.refresh_token) {
      client.updateAuthConfig({ refreshToken: tokens.refresh_token });
    }
    client.persistAuthConfig();

    output.spinner('Downloading');
    return await pullEnvRecords(client, pullId, source, options);
  }
}

export function getAcrValuesFromWWWAuthenticate(header: string | undefined) {
  if (!header) {
    return;
  }

  const bearerIndex = header.toLowerCase().indexOf('bearer');
  if (bearerIndex === -1) {
    return;
  }

  const bearerChallenge = header.slice(bearerIndex + 'bearer'.length);
  const match = bearerChallenge.match(
    /(?:^|[,\s])acr_values=(?:"((?:\\.|[^"\\])*)"|([^,\s]+))/i
  );

  return match?.[1]?.replace(/\\(.)/g, '$1') ?? match?.[2];
}

function escapeValue(value: string | undefined) {
  return value
    ? value
        .replace(new RegExp('\n', 'g'), '\\n') // combine newlines (unix) into one line
        .replace(new RegExp('\r', 'g'), '\\r') // combine newlines (windows) into one line
    : '';
}
