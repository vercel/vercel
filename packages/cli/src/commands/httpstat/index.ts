/* eslint-disable no-console */
import chalk from 'chalk';
import { spawn } from 'child_process';
import { isErrnoException } from '@vercel/error-utils';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { help } from '../help';
import { httpstatCommand } from './command';
import output from '../../output-manager';
import { ensureLink } from '../../util/link/ensure-link';
import getScope from '../../util/get-scope';
import { getCommandName } from '../../util/pkg-name';
import { getOrCreateDeploymentProtectionToken } from '../curl/bypass-token';
import { getLinkedProject } from '../../util/projects/link';
import { getDeploymentUrlById } from '../curl/deployment-url';
import { requoteArgs } from './utils';
import { HttpstatTelemetryClient } from '../../util/telemetry/commands/httpstat';

export default async function httpstat(client: Client): Promise<number> {
  const { print } = output;

  const telemetryClient = new HttpstatTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(httpstatCommand.options);

  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { flags } = parsedArgs;

  if (parsedArgs.flags['--help']) {
    print(help(httpstatCommand, { columns: client.stderr.columns }));
    return 2;
  }

  // gotta remove 'httpstat' from the args list
  if (parsedArgs.args[0] === httpstatCommand.name) {
    parsedArgs.args.shift();
  }

  const separatorIndex = process.argv.indexOf('--');
  const path = parsedArgs.args[0];

  telemetryClient.trackCliArgumentPath(path);

  const deploymentFlag = flags['--deployment'];
  if (deploymentFlag) {
    telemetryClient.trackCliOptionDeployment(deploymentFlag);
  }

  const protectionBypassFlag = flags['--protection-bypass'];
  if (protectionBypassFlag) {
    telemetryClient.trackCliOptionProtectionBypass(protectionBypassFlag);
  }

  if (!path || path === '--' || path.startsWith('--')) {
    output.error(
      `${getCommandName('httpstat <path>')} requires an API path (e.g., '/' or '/api/hello' or 'api/hello')`
    );
    print(help(httpstatCommand, { columns: client.stderr.columns }));
    return 1;
  }

  const httpstatFlags =
    separatorIndex !== -1 ? process.argv.slice(separatorIndex + 1) : [];
  output.debug(
    `Httpstat flags (${httpstatFlags.length} args): ${JSON.stringify(httpstatFlags)}`
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
    link = await ensureLink('httpstat', client, client.cwd);
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

  if (deploymentFlag) {
    const deploymentUrl = await getDeploymentUrlById(client, deploymentFlag);
    if (!deploymentUrl) {
      output.error(`No deployment found for ID "${deploymentFlag}"`);
      return 1;
    }
    baseUrl = deploymentUrl;
  } else if (target) {
    baseUrl = `https://${target}`;
  } else {
    throw new Error('No deployment URL found for the project');
  }

  const fullUrl = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  output.debug(`${chalk.cyan('Target URL:')} ${chalk.bold(fullUrl)}`);

  // Get or create protection bypass secret
  let deploymentProtectionToken: string | null = null;

  if (project.id) {
    try {
      deploymentProtectionToken =
        protectionBypassFlag ??
        (await getOrCreateDeploymentProtectionToken(client, link));
    } catch (err) {
      output.error(
        `Failed to get deployment protection bypass token: ${err instanceof Error ? err.message : String(err)}`
      );
      return 1;
    }

    if (deploymentProtectionToken) {
      httpstatFlags.unshift(
        '-H',
        `x-vercel-protection-bypass: ${deploymentProtectionToken}`
      );
    }
  }

  httpstatFlags.unshift(fullUrl);

  output.debug(
    `Executing: httpstat ${httpstatFlags.map(requoteArgs).join(' ')}`
  );

  return new Promise<number>(resolve => {
    const httpstatProcess = spawn('httpstat', httpstatFlags, {
      stdio: 'inherit',
      shell: false,
    });

    httpstatProcess.on('error', (err: Error) => {
      if ('code' in err && err.code === 'ENOENT') {
        output.error('httpstat command not found. Please install httpstat.');
        output.log('');
        output.log('Installation instructions:');
        output.log('  macOS: brew install httpstat');
        output.log('  pip: pip install httpstat');
        output.log('  npm: npm install -g httpstat');
        output.log('');
        output.log(
          'Or visit: https://github.com/reorx/httpstat for more details'
        );
        resolve(1);
      } else {
        output.error(`Failed to execute httpstat: ${err.message}`);
        resolve(1);
      }
    });

    httpstatProcess.on('close', (code: number | null) => {
      resolve(code ?? 1);
    });
  });
}

