/* eslint-disable no-console */
import chalk from 'chalk';
import { spawn } from 'child_process';
import { isErrnoException } from '@vercel/error-utils';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { help } from '../help';
import { curlCommand } from './command';
import output from '../../output-manager';
import { ensureLink } from '../../util/link/ensure-link';
import getScope from '../../util/get-scope';
import { getCommandName } from '../../util/pkg-name';
import { getOrCreateDeploymentProtectionToken } from './bypass-token';
import { getLinkedProject } from '../../util/projects/link';
import { getDeploymentUrlById } from './deployment-url';
import { requoteArgs } from './utils';

export default async function curl(client: Client): Promise<number> {
  const { print } = output;

  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(curlCommand.options);

  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { flags } = parsedArgs;

  if (parsedArgs.flags['--help']) {
    print(help(curlCommand, { columns: client.stderr.columns }));
    return 2;
  }

  // gotta remove 'curl' from the args list
  if (parsedArgs.args[0] === curlCommand.name) {
    parsedArgs.args.shift();
  }

  const separatorIndex = process.argv.indexOf('--');
  const path = parsedArgs.args[0];

  if (!path || path === '--' || path.startsWith('--')) {
    output.error(
      `${getCommandName('curl <path>')} requires an API path (e.g., '/' or '/api/hello' or 'api/hello')`
    );
    print(help(curlCommand, { columns: client.stderr.columns }));
    return 1;
  }

  const curlFlags =
    separatorIndex !== -1 ? process.argv.slice(separatorIndex + 1) : [];
  output.debug(
    `Curl flags (${curlFlags.length} args): ${JSON.stringify(curlFlags)}`
  );

  let link;

  try {
    await getScope(client);
  } catch (err: unknown) {
    if (
      isErrnoException(err) &&
      (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED')
    ) {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  try {
    link = await ensureLink('curl', client, client.cwd);
  } catch (err: unknown) {
    if (isErrnoException(err) && err.code === 'NOT_AUTHORIZED') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  if (typeof link === 'number') {
    return link;
  }

  const { project } = link;

  const linkedProject = await getLinkedProject(client, client.cwd);

  if (linkedProject.status !== 'linked') {
    output.error('This command requires a linked project. Please run:');
    output.print('  vercel link');
    return 1;
  }

  if (!linkedProject.project || !linkedProject.org) {
    output.error('Failed to get project information');
    return 1;
  }

  const target = linkedProject.project.latestDeployments?.[0].url;

  let baseUrl: string;
  const deploymentId = flags['--deployment'];
  if (deploymentId) {
    const deploymentUrl = await getDeploymentUrlById(client, deploymentId);
    if (!deploymentUrl) {
      output.error(`No deployment found for ID "${deploymentId}"`);
      return 1;
    }
    baseUrl = deploymentUrl;
  } else if (target) {
    if (!target) {
      output.error(`No deployment found for environment "${target}"`);
      return 1;
    }
    baseUrl = `https://${target}`;
  } else {
    throw new Error('No deployment URL found for the project');
  }

  const fullUrl = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  output.debug(`${chalk.cyan('Target URL:')} ${chalk.bold(fullUrl)}`);

  // Get or create protection bypass secret
  let deploymentProtectionToken: string | null = null;

  if (project.id) {
    deploymentProtectionToken =
      flags['--protection-bypass'] ??
      (await getOrCreateDeploymentProtectionToken(client, link));
    if (deploymentProtectionToken) {
      curlFlags.unshift(
        '--header',
        `x-vercel-protection-bypass: ${deploymentProtectionToken}`
      );
    }
  }

  curlFlags.unshift('--url', fullUrl);

  output.debug(`Executing: curl ${curlFlags.map(requoteArgs).join(' ')}`);

  return new Promise<number>(resolve => {
    const curlProcess = spawn('curl', curlFlags, {
      stdio: 'inherit',
      shell: false,
    });

    curlProcess.on('error', (err: Error) => {
      if ('code' in err && err.code === 'ENOENT') {
        output.error('curl command not found. Please install curl.');
        resolve(1);
      } else {
        output.error(`Failed to execute curl: ${err.message}`);
        resolve(1);
      }
    });

    curlProcess.on('close', (code: number | null) => {
      resolve(code ?? 1);
    });
  });
}
