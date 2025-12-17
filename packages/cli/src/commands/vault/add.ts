import type Client from '../../util/client';
import { getLinkedProject } from '../../util/projects/link';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import param from '../../util/output/param';
import { addSubcommand } from './command';
import { emoji, prependEmoji } from '../../util/emoji';
import stamp from '../../util/output/stamp';

export default async function add(client: Client, argv: string[]) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(addSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags: opts } = parsedArgs;
  let [secretName] = args;

  if (args.length > 1) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName('vault add <name>')}`
    );
    return 1;
  }

  // Prompt for secret name if not provided
  if (!secretName) {
    secretName = await client.input.text({
      message: `What's the name of the secret?`,
      validate: val => (val ? true : 'Name cannot be empty'),
    });
  }

  const isGlobal = opts['--global'];
  const environment = opts['--environment'];
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
    output.log(
      `Creating ${param('global')} (team-level) secret ${param(secretName)}`
    );
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

    output.log(
      `Creating secret ${param(secretName)} for project ${param(link.project.name)}`
    );
  }

  // Collect key-value pairs interactively
  const secretData: Record<string, string> = {};
  let addingKeys = true;

  output.log('');
  output.log(
    'Enter key-value pairs for the secret (leave key empty to finish):'
  );
  output.log('');

  while (addingKeys) {
    const key = await client.input.text({
      message: 'Key (or press enter to finish):',
      validate: () => true, // Allow empty to finish
    });

    if (!key || key.trim() === '') {
      if (Object.keys(secretData).length === 0) {
        output.error('You must add at least one key-value pair.');
        continue;
      }
      addingKeys = false;
      break;
    }

    if (secretData[key]) {
      output.warn(`Key ${param(key)} already exists. Overwriting...`);
    }

    const value = await client.input.text({
      message: `Value for ${param(key)}:`,
      validate: val => (val ? true : 'Value cannot be empty'),
    });

    secretData[key] = value;
    output.log(`${emoji('success')} Added ${param(key)}`);
  }

  output.log('');

  // Show summary
  const keyCount = Object.keys(secretData).length;
  output.log(
    `Creating secret ${param(secretName)} with ${keyCount} key${keyCount === 1 ? '' : 's'}...`
  );

  // Make API request
  const envParam = environment ? environment.toUpperCase() : 'PRODUCTION';
  const queryParams = new URLSearchParams();
  queryParams.set('projectId', projectId);
  queryParams.set('environment', envParam);

  try {
    const url = `/v1/vault/${teamId}/data/${secretName}?${queryParams.toString()}`;

    await client.fetch(url, {
      method: 'POST',
      body: { data: secretData },
    });

    output.log('');
    output.success(
      `${prependEmoji(
        `Secret ${param(secretName)} created ${stamp()}`,
        emoji('success')
      )}`
    );
    output.log('');

    return 0;
  } catch (error) {
    output.error(`Failed to create secret: ${error.message}`);
    return 1;
  }
}
