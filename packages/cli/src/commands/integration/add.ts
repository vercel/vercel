import type { Project, ProjectEnvTarget } from '@vercel-internals/types';
import { Output } from '../../util/output';
import Client from '../../util/client';
import IntegrationNameMap, { IntegrationMapItem } from './map';
import { prependEmoji, emoji } from '../../util/emoji';
import { exec as execCallback } from 'child_process';
import addEnvRecord from '../../util/env/add-env-record';
import { envTargetChoices } from '../../util/env/env-target';
import fs from 'fs/promises';
import { promisify } from 'util';
import path from 'path';

const exec = promisify(execCallback); // Convert exec to a promise-based function

export default async function add(
  client: Client,
  project: Project,
  integrationName: string,
  output: Output
): Promise<number> {
  const integration = IntegrationNameMap?.get(integrationName);
  output.log(`Project: ${project}`);

  if (!integration) {
    output.error(
      `${integrationName} is not a known Vercel Marketplace Integration.`
    );
    return 1;
  }

  const apiKeysToAdd = await integration.setup(client);

  if (apiKeysToAdd === 1) {
    output.error(`Failed to setup ${integrationName} integration`);
    return 1;
  }

  let envTargets: ProjectEnvTarget[] = [];

  while (envTargets.length === 0) {
    envTargets = await client.input.checkbox({
      message: `Add ${integrationName} to which Environments (select multiple)?`,
      choices: envTargetChoices,
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

  output.log(
    `Installing ${integrationName} integration to Project ${project.name}`
  );

  const libraryResponse = await installNeededLibraries(output, integration);

  if (libraryResponse === 1) {
    output.error(`Failed to install required libraries for ${integrationName}`);
    return 1;
  }

  const projectCodeResponse = await Promise.all(
    integration.code.map(async code => {
      return await setupIntegrationCode(
        output,
        integrationName,
        code.path,
        code.content
      );
    })
  );

  if (projectCodeResponse.includes(1)) {
    output.error(
      `Failed to setup ${integrationName} integration code for Project ${project.name}`
    );
    return 1;
  }

  const framework = project.framework;

  if (!framework) {
    output.error(
      `No framework detected in the project. Please specify a framework in the vercel.json file.`
    );
    return 1;
  }

  const isFrameworkSupported = integration.supportedFrameworks.has(framework);

  if (!isFrameworkSupported) {
    output.error(
      `${integrationName} integration does not support the ${framework} framework`
    );
    return 1;
  }

  const setupResponse = await Promise.all(
    integration.frameworkSpecificCode[framework].map(async code => {
      return setupIntegrationCode(
        output,
        integrationName,
        code.path,
        code.content
      );
    })
  );

  if (setupResponse.includes(1)) {
    output.error(
      `Failed to setup ${integrationName} integration code for ${framework} framework`
    );
    return 1;
  }

  await exec(`vercel env pull`);

  output.print(
    `${prependEmoji(
      `Successfully added ${integrationName} integration code to ${project.name}`,
      emoji('success')
    )}\n`
  );
  return 0;
}

async function installNeededLibraries(
  output: Output,
  integration: IntegrationMapItem
): Promise<number> {
  await exec(`pnpm install ${integration.packages.join(' ')}`).catch(
    (error: any) => {
      output.error(`exec error: ${error}`);
      return 1;
    }
  );
  return 0;
}

async function setupIntegrationCode(
  output: Output,
  integrationName: string,
  codePath: string,
  content: string
): Promise<number> {
  try {
    // Resolve the directory path
    const dirPath = path.dirname(codePath);

    // Ensure the directory exists, create it if not
    await fs.mkdir(dirPath, { recursive: true });

    // Write the file, if the file doesn't exist, it will be created
    await fs.writeFile(codePath, content);

    return 0;
  } catch (err) {
    // Output error message
    return 1;
  }
}
