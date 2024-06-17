import type { Project, ProjectEnvTarget } from '@vercel-internals/types';
import { Output } from '../../util/output';
import Client from '../../util/client';
import IntegrationNameMap, { IntegrationMapItem } from './map';
import readStandardInput from '../../util/input/read-standard-input';
import { getCommandName } from '../../util/pkg-name';
import chalk from 'chalk';
import { prependEmoji, emoji } from '../../util/emoji';
import { exec as execCallback } from 'child_process';
import addEnvRecord from '../../util/env/add-env-record';
import { Separator } from '@inquirer/checkbox';
import { envTargetChoices } from '../../util/env/env-target';
import fs from 'fs/promises';
import { promisify } from 'util';
import path from 'path';

const exec = promisify(execCallback); // Convert exec to a promise-based function

export default async function add(
  client: Client,
  project: Project,
  args: string[],
  output: Output
) {
  const stdInput = await readStandardInput(client.stdin);
  let [integrationName] = args;

  if (args.length > 1) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(`install <name>`)}`
    );
    return 1;
  }

  if (stdInput && !integrationName) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env add <name> <target> <gitbranch> < <file>`
      )}`
    );
    return 1;
  }

  const integration = IntegrationNameMap?.get(integrationName);

  if (!integration) {
    output.error(
      `${integrationName} is not a known Vercel Marketplace Integration.`
    );
    return 1;
  }

  const apiKeysToAdd = await integration.setup(client, output);

  if (apiKeysToAdd === 1) {
    output.error('Failed to setup integration');
    return 1;
  }

  let envTargets: ProjectEnvTarget[] = [];

  while (envTargets.length === 0) {
    envTargets = await client.input.checkbox({
      message: `Add ${integrationName} to which Environments (select multiple)?`,
      choices: [new Separator(' = Environment = '), ...envTargetChoices],
    });

    if (envTargets.length === 0) {
      output.error('Please select at least one Environment');
    }
  }

  await Promise.all(
    apiKeysToAdd.map(async apiKey => {
      await addEnvRecord(
        output,
        client,
        project.id,
        'true',
        'encrypted',
        apiKey.key,
        apiKey.value,
        envTargets,
        ''
      );
    })
  );

  output.print(
    `${prependEmoji(
      `${'Added'} Environment Variable(s) ${chalk.bold(
        apiKeysToAdd.map(apiKey => apiKey.key).join(', ')
      )} to Project ${chalk.bold(project.name)}`,
      emoji('success')
    )}\n`
  );

  // install the contentful-management npm package to the project
  output.log(
    `Installing ${integrationName} integration to Project ${project.name}`
  );

  await installNeededLibraries(output, integration);

  await Promise.all(
    integration.code.map(async code => {
      await setupIntegrationCode(
        output,
        integrationName,
        code.path,
        code.content
      );
    })
  );

  const framework = project.framework;

  if (!framework) {
    output.error(
      `No framework detected in the project. Please specify a framework in the vercel.json file.`
    );
    return 1;
  }

  const isFrameworkSupported = integration.frameworkSpecificCode[framework];

  if (!isFrameworkSupported) {
    output.error(
      `${integrationName} integration does not support the ${framework} framework`
    );
    return 1;
  }

  await Promise.all(
    integration.frameworkSpecificCode[framework].map(async code => {
      await setupIntegrationCode(
        output,
        integrationName,
        code.path,
        code.content
      );
    })
  );

  await exec(`vercel env pull`);
}

async function installNeededLibraries(
  output: Output,
  integration: IntegrationMapItem
) {
  output.log('Installing necessary npm packages for integration');

  await exec(`pnpm install ${integration.packages.join(' ')}`).catch(
    (error: any) => {
      output.error(`exec error: ${error}`);
      return 1;
    }
  );

  output.print(
    `${prependEmoji(
      `Installed ${chalk.bold(
        integration.packages.join(', ')
      )} npm package to Project`,
      emoji('success')
    )}\n`
  );
}

async function setupIntegrationCode(
  output: Output,
  integrationName: string,
  codePath: string,
  content: string
) {
  try {
    // Resolve the directory path
    const dirPath = path.dirname(codePath);

    // Ensure the directory exists, create it if not
    await fs.mkdir(dirPath, { recursive: true });

    // Write the file, if the file doesn't exist, it will be created
    await fs.writeFile(codePath, content);

    // Output success message
    output.print(
      `${prependEmoji(
        `Successfully added ${integrationName} integration code to ${codePath}`,
        emoji('success')
      )}\n`
    );
  } catch (err) {
    // Output error message
    output.error(`Error when setting up integration code: ${err}`);
  }
}
