import { basename, join } from 'node:path';
import { ensureDir, writeFile } from 'fs-extra';
import { parseArguments } from '../../util/get-args';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { help } from '../help';
import { tunnelCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { TunnelTelemetryClient } from '../../util/telemetry/commands/tunnel';
import { connect } from './connect';
import { ensureLink } from '../../util/link/ensure-link';
import stamp from '../../util/output/stamp';
import createDeploy from '../../util/deploy/create-deploy';
import Now, { type CreateOptions } from '../../util';
import parseTarget from '../../util/parse-target';

const localConfig = {
  routes: [{ src: '/(.*)', dest: '/_tunnel/$1' }],
};

export default async function main(client: Client) {
  const defaultProjectName = `tunnel-${basename(client.cwd)}`;
  const cwd = join(client.cwd, '.vercel', 'tunnel');
  await ensureDir(cwd);
  await writeFile(join(cwd, 'vercel.json'), JSON.stringify(localConfig));
  client.localConfig = localConfig;
  client.cwd = cwd;

  const { telemetryEventStore } = client;
  const telemetry = new TunnelTelemetryClient({
    opts: {
      store: telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(tunnelCommand.options);
  let parsedArgs = null;

  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const port = parsedArgs.flags['--port'];
  const prod = parsedArgs.flags['--prod'];

  telemetry.trackCliOptionPort(port);
  telemetry.trackCliFlagProd(prod);

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('tunnel');
    output.print(help(tunnelCommand, { columns: client.stderr.columns }));
    return 2;
  }

  if (parsedArgs.args.length > 1) {
    output.error(`${getCommandName('tunnel')} does not accept any arguments`);
    return 1;
  }

  if (!port) {
    output.error('The `--port` option is required');
    return 1;
  }

  if (typeof port !== 'number' || port < 1 || port > 65535) {
    output.error(
      'The `--port` option must be a valid port number between 1 and 65535'
    );
    return 1;
  }

  const autoConfirm = false; //parsedArguments.flags['--yes'];

  const link = await ensureLink('deploy', client, cwd, {
    autoConfirm,
    setupMsg: 'Set up and deploy',
    projectName: defaultProjectName,
  });
  if (typeof link === 'number') {
    return link;
  }

  const { project, org } = link;
  client.config.currentTeam = org.type === 'team' ? org.id : undefined;
  const contextName = org.slug;
  const noWait = true;
  const deployStamp = stamp();

  try {
    const now = new Now({
      client,
      currentTeam: client.config.currentTeam,
    });
    const createArgs: CreateOptions = {
      name: project.name,
      env: {},
      build: { env: {} },
      quiet: false,
      wantsPublic: false,
      nowConfig: localConfig,
      //regions: localConfig.regions,
      meta: {},
      //gitMetadata,
      deployStamp,
      target: parseTarget({
        flagName: 'target',
        flags: parsedArgs.flags,
      }),
      skipAutoDetectionConfirmation: autoConfirm,
      noWait,
      //autoAssignCustomDomains,
    };
    const deployment = await createDeploy(
      client,
      now,
      contextName,
      cwd,
      createArgs,
      org,
      !project
    );

    // Use the client's auth token as the OIDC token for tunnel authentication
    const oidcToken = client.authConfig.token;
    if (!oidcToken) {
      output.error('Please login to your account to use the tunnel command');
      return 1;
    }

    const tunnelUrl = `https://${deployment.url}`;
    connect(deployment.id, oidcToken, tunnelUrl, '127.0.0.1', port);

    process.on('SIGINT', () => {
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      process.exit(0);
    });
  } catch (err) {
    output.prettyError(err);
    return 1;
  }
}
