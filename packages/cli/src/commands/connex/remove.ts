import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import { validateJsonOutput } from '../../util/output-format';
import { selectConnexTeam } from '../../util/connex/select-team';

interface ConnexClientIdentity {
  id: string;
  uid: string;
  name?: string;
}

interface ConnexClientProject {
  clientId: string;
  projectId: string;
  project?: { id: string; name: string };
}

interface ListProjectsResponse {
  projects: ConnexClientProject[];
  cursor?: string;
}

export async function remove(
  client: Client,
  args: string[],
  flags: {
    '--yes'?: boolean;
    '--disconnect-all'?: boolean;
    '--format'?: string;
    '--json'?: boolean;
  }
): Promise<number> {
  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const skipConfirmation = !!flags['--yes'];
  const disconnectAll = !!flags['--disconnect-all'];

  if (asJson && !skipConfirmation) {
    output.error('--format=json requires --yes to skip confirmation prompts');
    return 1;
  }

  const clientIdOrUid = args[0];
  if (!clientIdOrUid) {
    output.error(
      'Missing client ID or UID. Usage: vercel connex remove <client>'
    );
    return 1;
  }

  await selectConnexTeam(client, 'Select the team for this Connex client');

  output.spinner('Retrieving Connex client…');
  let target: ConnexClientIdentity;
  try {
    target = await client.fetch<ConnexClientIdentity>(
      `/v1/connex/clients/${encodeURIComponent(clientIdOrUid)}`
    );
  } catch (err: unknown) {
    output.stopSpinner();
    const status = (err as { status?: number }).status;
    if (status === 404) {
      output.error(`No Connex client found for ${chalk.bold(clientIdOrUid)}.`);
      return 1;
    }
    output.error(
      `Failed to look up ${chalk.bold(clientIdOrUid)}: ${(err as Error).message}`
    );
    return 1;
  }
  output.stopSpinner();

  const displayName = target.uid || target.id;

  let projectLinks: ConnexClientProject[];
  try {
    output.spinner('Checking connected projects…');
    const res = await client.fetch<ListProjectsResponse>(
      `/v1/connex/clients/${encodeURIComponent(target.id)}/projects`
    );
    projectLinks = res.projects ?? [];
  } catch (err: unknown) {
    output.stopSpinner();
    output.error(
      `Failed to list connected projects for ${chalk.bold(displayName)}: ${(err as Error).message}`
    );
    return 1;
  }
  output.stopSpinner();

  if (projectLinks.length > 0 && !disconnectAll) {
    const count = projectLinks.length;
    const plural = count === 1 ? 'project' : 'projects';
    output.error(
      `Cannot delete Connex client ${chalk.bold(displayName)} while it has ${count} connected ${plural}. Please disconnect any projects using this client first or use the \`--disconnect-all\` flag.`
    );
    return 1;
  }

  if (!skipConfirmation && !client.stdin.isTTY) {
    output.error(
      'Confirmation required. Use `--yes` to skip the confirmation prompt.'
    );
    return 1;
  }

  if (!skipConfirmation) {
    const cascadeNote =
      projectLinks.length > 0
        ? ` ${projectLinks.length} connected ${projectLinks.length === 1 ? 'project' : 'projects'} will be disconnected.`
        : '';
    output.log(
      `Connex client ${chalk.bold(displayName)} will be deleted permanently.${cascadeNote}`
    );
    const confirmed = await client.input.confirm(
      `${chalk.red('Are you sure?')}`,
      false
    );
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  try {
    output.spinner('Deleting Connex client…');
    await client.fetch<unknown>(
      `/v1/connex/clients/${encodeURIComponent(target.id)}`,
      { method: 'DELETE' }
    );
  } catch (err: unknown) {
    output.stopSpinner();
    output.error(
      `A problem occurred when attempting to delete ${chalk.bold(displayName)}: ${(err as Error).message}`
    );
    return 1;
  }
  output.stopSpinner();

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify({ id: target.id, uid: target.uid, removed: true }, null, 2)}\n`
    );
    return 0;
  }

  output.success(
    `Connex client ${chalk.bold(displayName)} successfully removed.`
  );
  return 0;
}
