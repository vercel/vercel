import type { ProjectLinked, ProjectNotLinked } from '@vercel-internals/types';

import Client from '../../util/client';
import list from '../../util/input/list';
import text from '../../util/input/text';
import { createStore } from '../../util/stores/create-store';
import { linkStore } from '../../util/stores/link-store';

type Options = {
  '--type': string;
  '--name': string;
};

type CreateOptions = {
  client: Client;
  projectLink: ProjectLinked | ProjectNotLinked;
  opts: Partial<Options>;
};

const VALID_STORE_TYPES = { blob: 'blob', kv: 'kv', postgres: 'postgres' };

function validStoreType(storetype: string) {
  return Object.values(VALID_STORE_TYPES).includes(storetype);
}

async function inquireStoreType({
  client,
  opts,
}: CreateOptions): Promise<string | undefined> {
  const storeType =
    opts['--type'] ??
    (await list(client, {
      choices: [
        {
          name: 'Blob - Fast object storage',
          value: VALID_STORE_TYPES.blob,
          short: VALID_STORE_TYPES.blob,
        },
        {
          name: 'KV - Durable Redis',
          value: VALID_STORE_TYPES.kv,
          short: VALID_STORE_TYPES.kv,
        },
        {
          name: 'Postgres - Serverless SQL',
          value: VALID_STORE_TYPES.postgres,
          short: VALID_STORE_TYPES.postgres,
        },
      ],
      message: 'What kind of store do you want to create?',
    }));

  if (!validStoreType(storeType)) {
    const validTypes = Object.values(VALID_STORE_TYPES).join(', ');
    client.output.error(
      `Received invalid store type '${storeType}'. Valid types are: ${validTypes}.`
    );

    return;
  }

  if (!storeType) {
    client.output.log('Canceled');
    return;
  }

  return storeType;
}

function validStoreName(storename: string) {
  return storename.length > 5;
}

async function inquireStoreName(
  storeType: string,
  { opts, client, projectLink }: CreateOptions
): Promise<string | undefined> {
  const name =
    opts['--name'] ??
    (await text({
      label: 'Select a store name: ',
      validateValue: validStoreName,
      initialValue:
        projectLink.status === 'linked'
          ? `${projectLink.project.name}-${storeType}`
          : `my-${storeType}-store`,
    }));

  if (!validStoreName(name)) {
    client.output.error(
      `Invalid store name '${name}'. Store names must be at least 6 characters long.`
    );
    return;
  }

  if (!name) {
    client.output.log('No name input');
    return;
  }

  return name;
}

const POSTGRES_REGIONS = [
  'aws-us-east-1',
  'aws-us-east-2',
  'aws-us-west-2',
  'aws-eu-central-1',
  'aws-ap-southeast-1',
];

async function creaetPostgresStore(name: string, { client }: CreateOptions) {
  const { region } = await client.prompt({
    type: 'list',
    name: 'region',
    message:
      'In which region should your database reads and writes take place?',
    choices: POSTGRES_REGIONS,
    default: POSTGRES_REGIONS[0],
  });

  return createStore({ client, payload: { name, region }, type: 'postgres' });
}

async function maybeLinkStore(
  { id, name }: { id: string; name: string },
  { client, projectLink }: CreateOptions
): Promise<boolean> {
  if (projectLink.status === 'not_linked') {
    client.output.print(
      `\nYou can link the store later in the Vercel dashboard.`
    );

    return true;
  }

  const linked = await linkStore({ client, link: projectLink, name, id });

  if (!linked) {
    client.output.error('Failed to link store');
    return false;
  }

  return true;
}

export async function create(options: CreateOptions) {
  const { client } = options;

  const type = await inquireStoreType(options);
  if (!type) {
    return 1;
  }

  const name = await inquireStoreName(type, options);
  if (!name) {
    return 1;
  }

  let result;

  switch (type) {
    case 'blob':
      result = await createStore({ client, payload: { name }, type: 'blob' });
      break;
    case 'kv':
      result = await createStore({ client, payload: { name }, type: 'redis' });
      break;
    case 'postgres':
      result = await creaetPostgresStore(name, options);
  }

  if (!result) {
    return 1;
  }

  const linked = await maybeLinkStore(result, options);
  if (!linked) {
    return 1;
  }

  return 0;
}
