import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import { validateJsonOutput } from '../../util/output-format';
import { printError } from '../../util/error';
import { selectConnexTeam } from '../../util/connex/select-team';
import { getLinkedProject } from '../../util/projects/link';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { ProjectNotFound } from '../../util/errors-ts';
import { packageName } from '../../util/pkg-name';
import type { ConnexClientIdentity, ConnexClientProject } from './types';

export async function detach(
  client: Client,
  args: string[],
  flags: {
    '--project'?: string;
    '--yes'?: boolean;
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

  if (asJson && !skipConfirmation) {
    output.error('--format=json requires --yes to skip confirmation prompts');
    return 1;
  }

  const clientIdOrUid = args[0];
  if (!clientIdOrUid) {
    output.error(
      'Missing connector ID or UID. Usage: vercel connect detach <client>'
    );
    return 1;
  }

  // Resolve project — explicit --project takes priority over the linked one.
  let projectId: string;
  let projectName: string;

  const projectFlag = flags['--project'];
  if (projectFlag) {
    await selectConnexTeam(client, 'Select the team that owns this project');
    const team = client.config.currentTeam;

    output.spinner('Looking up project…');
    let resolvedProject;
    try {
      resolvedProject = await getProjectByNameOrId(client, projectFlag, team);
    } catch (err: unknown) {
      output.stopSpinner();
      printError(err);
      return 1;
    }
    output.stopSpinner();

    if (resolvedProject instanceof ProjectNotFound) {
      output.error(
        `Project ${chalk.bold(projectFlag)} was not found. Check the name/ID and try again.`
      );
      return 1;
    }

    projectId = resolvedProject.id;
    projectName = resolvedProject.name;
  } else {
    const linked = await getLinkedProject(client);
    if (linked.status === 'error') {
      return linked.exitCode;
    }
    if (linked.status === 'not_linked') {
      output.error(
        `No linked project found. Run \`${packageName} link\` first or pass --project=<name_or_id>.`
      );
      return 1;
    }
    if (linked.org.type === 'team') {
      client.config.currentTeam = linked.org.id;
    } else {
      client.config.currentTeam = undefined;
    }
    projectId = linked.project.id;
    projectName = linked.project.name;
  }

  // Resolve client identity → canonical id + display name.
  output.spinner('Retrieving connector…');
  let target: ConnexClientIdentity;
  try {
    target = await client.fetch<ConnexClientIdentity>(
      `/v1/connect/connectors/${encodeURIComponent(clientIdOrUid)}`
    );
  } catch (err: unknown) {
    output.stopSpinner();
    const status = (err as { status?: number }).status;
    if (status === 404) {
      output.error(`No connector found for ${chalk.bold(clientIdOrUid)}.`);
      return 1;
    }
    printError(err);
    return 1;
  }
  output.stopSpinner();

  const displayName = target.uid || target.name || target.id;

  // Pre-fetch existing attachment. If absent, treat as a no-op success.
  let existingAttachment: ConnexClientProject | undefined;
  try {
    existingAttachment = await client.fetch<ConnexClientProject>(
      `/v1/connect/connectors/${encodeURIComponent(target.id)}/projects/${encodeURIComponent(projectId)}`
    );
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status !== 404) {
      printError(err);
      return 1;
    }
  }

  if (!existingAttachment) {
    if (asJson) {
      client.stdout.write(
        `${JSON.stringify(
          {
            clientId: target.id,
            uid: target.uid,
            projectId,
            unchanged: true,
          },
          null,
          2
        )}\n`
      );
      return 0;
    }
    output.log(
      `Connector ${chalk.bold(displayName)} is not attached to ${chalk.bold(
        projectName
      )}. Nothing to do.`
    );
    return 0;
  }

  // Confirmation.
  if (!skipConfirmation && !client.stdin.isTTY) {
    output.error(
      'Confirmation required. Use `--yes` to skip the confirmation prompt.'
    );
    return 1;
  }

  if (!skipConfirmation) {
    const envs = (existingAttachment.environments ?? []).join(', ') || '—';
    output.log(
      `Connector ${chalk.bold(displayName)} will be detached from ${chalk.bold(
        projectName
      )}.`
    );
    output.log(`  Environments: ${envs}`);

    const confirmed = await client.input.confirm('Continue?', false);
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  // Detach.
  output.spinner('Detaching project…');
  try {
    await client.fetch<unknown>(
      `/v1/connect/connectors/${encodeURIComponent(target.id)}/projects/${encodeURIComponent(projectId)}`,
      { method: 'DELETE' }
    );
  } catch (err: unknown) {
    output.stopSpinner();
    const status = (err as { status?: number }).status;
    if (status === 403) {
      output.error(
        `You don't have permission to detach projects on this team. Owner or Member role required.`
      );
      return 1;
    }
    if (status === 404) {
      // Race: the attachment disappeared between pre-fetch and DELETE. Treat as success.
      if (asJson) {
        client.stdout.write(
          `${JSON.stringify(
            {
              clientId: target.id,
              uid: target.uid,
              projectId,
              unchanged: true,
            },
            null,
            2
          )}\n`
        );
        return 0;
      }
      output.log(
        `Connector ${chalk.bold(displayName)} is not attached to ${chalk.bold(
          projectName
        )}. Nothing to do.`
      );
      return 0;
    }
    printError(err);
    return 1;
  }
  output.stopSpinner();

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        {
          clientId: target.id,
          uid: target.uid,
          projectId,
          detached: true,
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  output.success(
    `Detached connector ${chalk.bold(displayName)} from ${chalk.bold(projectName)}.`
  );
  return 0;
}
