import type Client from '../../util/client';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { getLinkedProject } from '../../util/projects/link';
import { connectResourceToProject } from '../../util/integration-resource/connect-resource-to-project';
import chalk from 'chalk';
import { getCommandName } from '../../util/pkg-name';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { newStoreSubcommand } from './command';

export default async function newStore(
  client: Client,
  argv: string[]
): Promise<number> {
  const flagsSpecification = getFlagsSpecification(newStoreSubcommand.options);

  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  let {
    args: [name],
  } = parsedArgs;

  if (!name) {
    name = await client.input.text({
      message: 'Enter a name for your blob store',
      validate: value => {
        if (value.length < 5) {
          return 'Name must be at least 5 characters long';
        }
        return true;
      },
    });
  }

  let storeId: string;
  try {
    output.debug('Creating new blob store');

    output.spinner('Creating new blob store');

    const res = await client.fetch<{ store: { id: string } }>(
      '/v1/storage/stores/blob',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }
    );

    storeId = res.store.id;
  } catch (err) {
    printError(err);
    return 1;
  }

  output.stopSpinner();

  output.success(`Blob store created: ${name} (${storeId})`);

  const link = await getLinkedProject(client);
  if (link.status === 'linked') {
    const res = await client.input.confirm(
      `Would you like to link this blob store to ${link.project.name}?`,
      false
    );

    if (res) {
      const environments = await client.input.checkbox({
        message: 'Select environments',
        choices: [
          { name: 'Production', value: 'production', checked: true },
          { name: 'Preview', value: 'preview', checked: true },
          { name: 'Development', value: 'development', checked: true },
        ],
      });

      output.spinner(
        `Connecting ${chalk.bold(name)} to ${chalk.bold(link.project.name)}...`
      );

      await connectResourceToProject(
        client,
        link.project.id,
        storeId,
        environments
      );

      output.success(
        `Blob store ${chalk.bold(name)} linked to ${chalk.bold(
          link.project.name
        )}. Make sure to update the environment variables again using ${getCommandName('env pull')}`
      );
    }
  }

  return 0;
}
