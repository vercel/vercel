import type Client from '../../util/client';
import output from '../../output-manager';
import { getLinkedProject } from '../../util/projects/link';
import { connectResourceToProject } from '../../util/integration-resource/connect-resource-to-project';
import chalk from 'chalk';
import { getCommandName } from '../../util/pkg-name';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { addStoreSubcommand } from './command';
import { BlobAddStoreTelemetryClient } from '../../util/telemetry/commands/blob/store-add';
import { printError } from '../../util/error';

export default async function addStore(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new BlobAddStoreTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(addStoreSubcommand.options);

  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const {
    args: [nameArg],
    flags,
  } = parsedArgs;

  const region = flags['--region'] || 'iad1';

  let name = nameArg;
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

  telemetryClient.trackCliArgumentName(name);
  telemetryClient.trackCliOptionRegion(flags['--region']);

  const link = await getLinkedProject(client);

  let storeId: string;
  let storeRegion: string | undefined;
  try {
    output.debug('Creating new blob store');

    output.spinner('Creating new blob store');

    const requestBody: { name: string; region: string } = {
      name,
      region,
    };

    const res = await client.fetch<{ store: { id: string; region?: string } }>(
      '/v1/storage/stores/blob',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        accountId: link.status === 'linked' ? link.org.id : undefined,
      }
    );

    storeId = res.store.id;
    storeRegion = res.store.region;
  } catch (err) {
    printError(err);
    return 1;
  }

  output.stopSpinner();

  const regionInfo = storeRegion ? ` in ${storeRegion}` : '';
  output.success(`Blob store created: ${name} (${storeId})${regionInfo}`);

  if (link.status === 'linked') {
    const res = await client.input.confirm(
      `Would you like to link this blob store to ${link.project.name}?`,
      true
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
        environments,
        link.org.id
      );

      output.success(
        `Blob store ${chalk.bold(name)} linked to ${chalk.bold(
          link.project.name
        )}. Make sure to pull the new environment variables using ${getCommandName('env pull')}`
      );
    }
  }

  return 0;
}
