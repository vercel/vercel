import chalk from 'chalk';
import { join } from 'node:path';
import output from '../../output-manager';
import { getContextName } from '../../util/get-scope';
import type Client from '../../util/client';
import { ensureLink } from '../../util/link/ensure-link';
import { emoji, prependEmoji } from '../../util/emoji';
import humanizePath from '../../util/humanize-path';
import stamp from '../../util/output/stamp';
import { outputJSON } from 'fs-extra';
import { pullSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import {
  getRenamedOption,
  reportRenamedOptionError,
} from '../../util/renamed-option';
import { MicrofrontendsPullTelemetryClient } from '../../util/telemetry/commands/microfrontends/pull';

interface MicrofrontendsConfig {
  $schema: string;
  applications: Record<
    string,
    {
      projectId?: string;
    }
  >;
}

const VERCEL_DIR = '.vercel';
const VERCEL_DIR_MICROFRONTENDS = 'microfrontends.json';

export default async function pull(client: Client): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(pullSubcommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 2;
  }

  const telemetry = new MicrofrontendsPullTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });
  telemetry.trackCliOptionDeployment(parsedArgs.flags['--deployment']);
  telemetry.trackCliOptionDpl(parsedArgs.flags['--dpl']);
  const deployment = getRenamedOption(
    parsedArgs.flags,
    '--deployment',
    '--dpl'
  );
  if ('error' in deployment) {
    return reportRenamedOptionError(client, deployment.error);
  }

  const autoConfirm = !!parsedArgs.flags['--yes'];
  const link = await ensureLink('microfrontends', client, client.cwd, {
    autoConfirm,
  });
  if (typeof link === 'number') {
    return link;
  }

  const { project, org, repoRoot } = link;

  let currentDirectory: string;
  if (repoRoot) {
    currentDirectory = join(repoRoot, project.rootDirectory || '');
  } else {
    currentDirectory = client.cwd;
  }

  client.config.currentTeam = org.type === 'team' ? org.id : undefined;

  const contextName = await getContextName(client);
  output.spinner(
    `Fetching microfrontends configuration in ${chalk.bold(contextName)}`
  );

  let rawConfig: MicrofrontendsConfig;
  const deploymentId = deployment.value;

  try {
    if (deploymentId) {
      const { config } = await client.fetch<{
        config: MicrofrontendsConfig;
      }>(`/v1/microfrontends/${deploymentId}/config`, {
        method: 'GET',
      });
      rawConfig = config;
    } else {
      const projectId = project.id;
      const { config } = await client.fetch<{
        config: MicrofrontendsConfig;
      }>(`/v1/microfrontends/projects/${projectId}/production-mfe-config`, {
        method: 'GET',
      });
      rawConfig = config;
    }

    // remove projectId from each application
    const sanitizedConfig: MicrofrontendsConfig = {
      ...rawConfig,
      applications: Object.fromEntries(
        Object.entries(rawConfig.applications).map(([name, app]) => [
          name,
          {
            ...app,
            projectId: undefined, // remove projectId
          },
        ])
      ),
    };

    output.stopSpinner();

    const path = join(currentDirectory, VERCEL_DIR, VERCEL_DIR_MICROFRONTENDS);
    await outputJSON(path, sanitizedConfig, {
      spaces: 2,
    });

    const microfrontendsStamp = stamp();
    output.print(
      `${prependEmoji(
        `Downloaded microfrontends configuration to ${chalk.bold(
          humanizePath(
            join(currentDirectory, VERCEL_DIR, VERCEL_DIR_MICROFRONTENDS)
          )
        )} ${chalk.gray(microfrontendsStamp())}`,
        emoji('success')
      )}\n`
    );

    return 0;
  } catch (error) {
    output.stopSpinner();
    printError(error);
    return 1;
  }
}
