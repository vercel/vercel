import { basename, join } from 'node:path';
import { ensureDir } from 'fs-extra';
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

export default async function main(client: Client) {
  const defaultProjectName = basename(client.cwd);
  const newCwd = join(client.cwd, '.vercel', 'tunnel');
  await ensureDir(newCwd);
  client.cwd = newCwd;
  client.localConfig = {
    routes: [{ src: '/(.*)', dest: '/_tunnel/$1' }],
  };
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

  const link = await ensureLink('deploy', client, client.cwd, {
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

  try {
    // TODO: make a deployment then tunnel to it

    output.print(
      `Starting tunnel for project ${project.name} with port ${port} on prod: ${prod ?? false}\n`
    );

    const noWait = true;
    const deployStamp = stamp();
    const now = new Now({
      client,
      currentTeam: client.config.currentTeam,
    });
    const createArgs: CreateOptions = {
      name: project.name,
      env: {},
      build: { env: {} },
      quiet: false, // TODO: should this be true?
      wantsPublic: false,
      nowConfig: client.localConfig,
      //regions: client.localConfig.regions,
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
      client.cwd, // TODO: verify this is correct
      createArgs,
      org,
      !project
    );
    //console.log('[debug] deployment is', deployment.url);
    connect(deployment.id, '127.0.0.1', port);
    process.on('SIGINT', () => {
      output.log('\n[tunnel] Shutting down...');
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      output.log('[tunnel] Received SIGTERM, shutting down...');
      process.exit(0);
    });
    output.log('[tunnel] Press Ctrl+C to stop');
  } catch (err) {
    output.prettyError(err);
    return 1;
  }
}
