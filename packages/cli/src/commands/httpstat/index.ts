/* eslint-disable no-console */
import { spawn } from 'child_process';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { help } from '../help';
import { httpstatCommand } from './command';
import output from '../../output-manager';
import { getCommandName } from '../../util/pkg-name';
import { requoteArgs } from '../curl/utils';
import { HttpstatTelemetryClient } from '../../util/telemetry/commands/httpstat';
import { getDeploymentUrlAndToken } from '../curl/shared';

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

  const result = await getDeploymentUrlAndToken(client, 'httpstat', path, {
    deploymentFlag,
    protectionBypassFlag,
  });

  if (typeof result === 'number') {
    return result;
  }

  const { fullUrl, deploymentProtectionToken } = result;

  if (deploymentProtectionToken) {
    httpstatFlags.unshift(
      '-H',
      `x-vercel-protection-bypass: ${deploymentProtectionToken}`
    );
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
