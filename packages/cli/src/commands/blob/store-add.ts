import type Client from '../../util/client';
import type { Project } from '@vercel-internals/types';
import output from '../../output-manager';
import { getLinkedProject } from '../../util/projects/link';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { addStoreSubcommand } from './command';
import { BlobAddStoreTelemetryClient } from '../../util/telemetry/commands/blob/store-add';
import { printError } from '../../util/error';
import { parseAccessFlag } from '../../util/blob/access';
import getProjectByIdOrName from '../../util/projects/get-project-by-id-or-name';
import { ProjectNotFound } from '../../util/errors-ts';
import selectOrg from '../../util/input/select-org';

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

  const accessFlag = flags['--access'];
  const access = parseAccessFlag(accessFlag);
  if (!access) return 1;

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
  telemetryClient.trackCliOptionAccess(accessFlag);
  telemetryClient.trackCliOptionRegion(flags['--region']);

  const link = await getLinkedProject(client);
  let accountId: string | undefined;

  if (link.status === 'linked') {
    accountId = link.org.id;
  } else {
    const org = await selectOrg(
      client,
      'Which scope should own the blob store?'
    );
    accountId = org.id;
  }

  // Select a project to link the blob store to
  const projectId = await selectProject(client, accountId);

  let storeId: string;
  let storeRegion: string | undefined;
  try {
    output.debug('Creating new blob store');

    output.spinner('Creating new blob store');

    const requestBody: {
      name: string;
      region: string;
      access: 'public' | 'private';
      projectId: string;
      version: string;
    } = {
      name,
      region,
      access,
      projectId,
      version: '2',
    };

    const res = await client.fetch<{ store: { id: string; region?: string } }>(
      '/v1/storage/stores/blob',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        accountId,
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

  return 0;
}

async function selectProject(
  client: Client,
  accountId: string
): Promise<string> {
  output.spinner('Fetching projects…', 1000);

  const firstPage = await client.fetch<{
    projects: Project[];
    pagination: { count: number; next: number | null };
  }>(`/v9/projects?limit=100`, { accountId });

  output.stopSpinner();

  const projects = firstPage.projects;
  const hasMoreProjects = firstPage.pagination.next !== null;

  if (projects.length === 0) {
    output.error(
      'No projects found. Create a project first before creating a blob store.'
    );
    process.exit(1);
  }

  if (hasMoreProjects) {
    // Too many projects to show in a list — ask the user to type a name
    let selectedProject: Project | undefined;
    await client.input.text({
      message: 'Enter the name of the project to link to the blob store:',
      validate: async val => {
        if (!val) {
          return 'Project name cannot be empty';
        }
        const project = await getProjectByIdOrName(client, val, accountId);
        if (project instanceof ProjectNotFound) {
          return 'Project not found';
        }
        selectedProject = project;
        return true;
      },
    });
    return selectedProject!.id;
  }

  const choices = projects
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(project => ({
      name: project.name,
      value: project.id,
    }));

  return await client.input.select<string>({
    message: 'Select a project to link to the blob store:',
    choices,
  });
}
