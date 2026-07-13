import type Client from '../../util/client';
import output from '../../output-manager';
import { getLinkedProject } from '../../util/projects/link';
import { connectResourceToProject } from '../../util/integration-resource/connect-resource-to-project';
import chalk from 'chalk';
import { envPullCommandLogic } from '../env/pull';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { createStoreSubcommand } from './command';
import { BlobAddStoreTelemetryClient } from '../../util/telemetry/commands/blob/store-add';
import { printError } from '../../util/error';
import { parseAccessFlag } from '../../util/blob/access';
import {
  VALID_ENVIRONMENTS,
  validateEnvironments,
} from '../../util/integration/post-provision-setup';
import {
  outputAgentError,
  buildCommandWithYes,
  buildCommandWithGlobalFlags,
} from '../../util/agent-output';

export default async function addStore(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new BlobAddStoreTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(
    createStoreSubcommand.options
  );

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

  // Prompting after the store is created flakes agents into duplicate stores.
  const interactive = client.stdin.isTTY && !client.nonInteractive;

  const yes = flags['--yes'] ?? false;
  const environmentFlags = flags['--environment'];

  // Validate --environment values early
  if (environmentFlags?.length) {
    const envValidation = validateEnvironments(environmentFlags);
    if (!envValidation.valid) {
      const message = `Invalid environment value: ${envValidation.invalid.map(e => `"${e}"`).join(', ')}. Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`;
      outputAgentError(client, {
        status: 'error',
        reason: 'invalid_arguments',
        message,
      });
      output.error(message);
      return 1;
    }
  }

  let accessFlag = flags['--access'];
  if (!accessFlag && interactive) {
    accessFlag = await client.input.select<'public' | 'private'>({
      message: 'Choose the access type for the blob store',
      choices: [
        {
          name: 'Private',
          value: 'private',
          description:
            'For sensitive documents, user content, and apps with custom auth. https://vercel.com/docs/vercel-blob/private-storage',
        },
        {
          name: 'Public',
          value: 'public',
          description:
            'For images, videos, large media, and public assets. https://vercel.com/docs/vercel-blob/public-storage',
        },
      ],
    });
  }
  if (!accessFlag) {
    outputAgentError(client, {
      status: 'error',
      reason: 'missing_arguments',
      message: "Missing required --access flag. Must be 'public' or 'private'.",
      next: [
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            'blob create-store <name> --access private --yes'
          ),
          when: 'create a private blob store and link it to the project',
        },
      ],
    });
  }
  const access = parseAccessFlag(accessFlag);
  if (!access) return 1;

  const region = flags['--region'] || 'iad1';

  let name = nameArg;
  if (!name) {
    if (interactive) {
      name = await client.input.text({
        message: 'Enter a name for your blob store',
        validate: value => {
          if (value.length < 5) {
            return 'Name must be at least 5 characters long';
          }
          return true;
        },
      });
    } else {
      outputAgentError(client, {
        status: 'error',
        reason: 'missing_arguments',
        message: 'Missing required argument: name.',
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              `blob create-store <name> --access ${access} --yes`
            ),
            when: 'create the blob store and link it to the project',
          },
        ],
      });
      output.error('Missing required argument: name');
      return 1;
    }
  }

  telemetryClient.trackCliArgumentName(name);
  telemetryClient.trackCliOptionAccess(accessFlag);
  telemetryClient.trackCliOptionRegion(flags['--region']);

  const link = await getLinkedProject(client);

  // Gate before creating so a blocked run creates nothing (no duplicate on retry).
  if (
    link.status === 'linked' &&
    client.nonInteractive &&
    !yes &&
    !environmentFlags?.length
  ) {
    outputAgentError(client, {
      status: 'error',
      reason: 'confirmation_required',
      message: `Creating a blob store and linking it to ${link.project.name} requires confirmation. Re-run with --yes to create the store and link it to all environments, or pass --environment to choose which ones.`,
      next: [
        {
          command: buildCommandWithYes(client.argv),
          when: 'create the store and link it to all environments',
        },
      ],
    });
    return 1;
  }

  let storeId: string;
  let storeRegion: string | undefined;
  try {
    output.debug('Creating new blob store');

    output.spinner('Creating new blob store');

    const res = await client.fetch<{ store: { id: string; region?: string } }>(
      '/v1/storage/stores/blob',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, region, access }),
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
  const docsUrl =
    access === 'public'
      ? 'https://vercel.com/docs/vercel-blob/public-storage'
      : 'https://vercel.com/docs/vercel-blob/private-storage';
  output.log(`Access: ${access}. Learn more: ${output.link(docsUrl, docsUrl)}`);

  if (link.status === 'linked') {
    // --yes or an explicit --environment list both mean "link without asking".
    let shouldLink = yes || Boolean(environmentFlags?.length);
    if (!shouldLink && interactive) {
      shouldLink = await client.input.confirm(
        `Would you like to link this blob store to ${link.project.name}?`,
        true
      );
    }

    if (!shouldLink && !interactive) {
      output.log(
        `Not linked to ${chalk.bold(link.project.name)}. Pass --yes when creating to link the store to your project automatically.`
      );
    }

    if (shouldLink) {
      let environments: string[];
      if (environmentFlags?.length) {
        environments = environmentFlags;
      } else if (interactive && !yes) {
        environments = await client.input.checkbox({
          message: 'Select environments',
          choices: [
            { name: 'Production', value: 'production', checked: true },
            { name: 'Preview', value: 'preview', checked: true },
            { name: 'Development', value: 'development', checked: true },
          ],
        });
      } else {
        environments = [...VALID_ENVIRONMENTS];
      }

      output.spinner(
        `Connecting ${chalk.bold(name)} to ${chalk.bold(link.project.name)}...`
      );

      await connectResourceToProject(
        client,
        link.project.id,
        storeId,
        environments,
        { accountId: link.org.id }
      );

      output.success(
        `Blob store ${chalk.bold(name)} linked to ${chalk.bold(
          link.project.name
        )}`
      );

      client.config.currentTeam =
        link.org.type === 'team' ? link.org.id : undefined;

      await envPullCommandLogic(
        client,
        '.env.local',
        true,
        'development',
        link,
        undefined,
        client.cwd,
        'vercel-cli:blob:store-add'
      );
    }
  }

  return 0;
}
