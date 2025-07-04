import chalk from 'chalk';
import { join } from 'node:path';
import output from '../../output-manager';
import getScope from '../../util/get-scope';
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
  const link = await ensureLink('microfrontends', client, client.cwd);
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

  const { contextName } = await getScope(client);
  output.spinner(
    `Fetching microfrontends configuration in ${chalk.bold(contextName)}`
  );

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(pullSubcommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 1;
  }

  let rawConfig: MicrofrontendsConfig;
  const dpl = parsedArgs.flags['--dpl'];

  try {
    if (dpl) {
      const { config } = await client.fetch<{
        config: MicrofrontendsConfig;
      }>(`/v1/microfrontends/${dpl}/config`, {
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
