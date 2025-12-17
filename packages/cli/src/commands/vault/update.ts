import type Client from '../../util/client';
import { getLinkedProject } from '../../util/projects/link';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import param from '../../util/output/param';
import { updateSubcommand } from './command';
import { emoji, prependEmoji } from '../../util/emoji';
import stamp from '../../util/output/stamp';

export default async function update(client: Client, argv: string[]) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(updateSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags: opts } = parsedArgs;

  // Parse key value pairs from arguments (e.g., KEY1 value1 KEY2 value2)
  const patchData: Record<string, string> = {};
  if (args.length > 0) {
    if (args.length % 2 !== 0) {
      output.error(
        'Invalid arguments. Expected pairs of KEY VALUE (e.g., API_KEY xyz TOKEN abc)'
      );
      return 1;
    }
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i];
      const value = args[i + 1];
      patchData[key] = value;
    }
  }

  const isGlobal = opts['--global'];
  let environment = opts['--environment'];
  let projectId = '';
  let teamId: string;

  if (isGlobal) {
    // Global secrets don't need a project
    if (!client.config.currentTeam) {
      output.error('No team selected. Run `vercel switch` to select a team.');
      return 1;
    }
    teamId = client.config.currentTeam;
    projectId = '';
  } else {
    // Project-specific secret
    const link = await getLinkedProject(client);
    if (link.status === 'error') {
      return link.exitCode;
    } else if (link.status === 'not_linked') {
      output.error(
        `Your codebase isn't linked to a project on Vercel. Run ${getCommandName('link')} to begin.`
      );
      return 1;
    }

    client.config.currentTeam =
      link.org.type === 'team' ? link.org.id : undefined;
    teamId = link.org.id;
    projectId = opts['--project'] || link.project.id;
  }

  // If no key-value pairs provided via args, collect interactively
  if (Object.keys(patchData).length === 0) {
    output.log('');
    output.log('Updating secrets in Vercel Vault');
    output.log('(Existing keys not mentioned will be preserved)');
    output.log('');

    // Prompt for environment if not specified
    if (!environment) {
      environment = await client.input.select({
        message: 'Which environment?',
        choices: [
          { value: 'production', title: 'Production' },
          { value: 'preview', title: 'Preview' },
          { value: 'development', title: 'Development' },
        ],
        initialValue: 'production',
      });
    }

    let addingKeys = true;

    while (addingKeys) {
      const key = await client.input.text({
        message: 'Key (or press enter to finish):',
        validate: () => true, // Allow empty to finish
      });

      if (!key || key.trim() === '') {
        if (Object.keys(patchData).length === 0) {
          output.error('You must add at least one key-value pair to update.');
          continue;
        }
        addingKeys = false;
        break;
      }

      if (patchData[key]) {
        output.warn(
          `Key ${param(key)} already exists in this update. Overwriting...`
        );
      }

      const value = await client.input.text({
        message: `New value for ${param(key)}:`,
        validate: val => (val ? true : 'Value cannot be empty'),
      });

      patchData[key] = value;
      output.log(`${emoji('success')} Will update ${param(key)}`);
    }

    output.log('');
  }

  // Show summary
  const keyCount = Object.keys(patchData).length;
  output.log(
    `Updating ${keyCount} secret${keyCount === 1 ? '' : 's'} in Vault...`
  );

  // Make API request - use "secrets" as the path for all KV pairs
  const vaultPath = 'secrets';
  const envParam = environment ? environment.toUpperCase() : 'PRODUCTION';
  const queryParams = new URLSearchParams();
  queryParams.set('projectId', projectId);
  queryParams.set('environment', envParam);

  try {
    const url = `/v1/vault/${teamId}/data/${vaultPath}?${queryParams.toString()}`;

    output.debug(`PATCH ${url}`);
    output.debug(`Body: ${JSON.stringify({ data: patchData })}`);

    await client.fetch(url, {
      method: 'PATCH',
      body: { data: patchData },
    });

    output.log('');
    output.success(
      `${prependEmoji(
        `${keyCount} secret${keyCount === 1 ? '' : 's'} updated ${stamp()}`,
        emoji('success')
      )}`
    );
    output.log('');

    return 0;
  } catch (error) {
    output.debug(`Error response: ${JSON.stringify(error)}`);
    if (error.status === 404) {
      output.error(
        `No secrets found in Vault. Use ${getCommandName('vault add')} to create some first.`
      );
      return 1;
    }
    if (error.status === 400) {
      output.error(
        `Bad request: ${error.message || 'Invalid request to Vault API'}`
      );
      if (error.code) {
        output.log(`Error code: ${error.code}`);
      }
      return 1;
    }
    output.error(`Failed to update secrets: ${error.message}`);
    return 1;
  }
}
