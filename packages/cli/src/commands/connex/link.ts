import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import { validateJsonOutput } from '../../util/output-format';
import { printError } from '../../util/error';
import { selectConnexTeam } from '../../util/connex/select-team';
import { getLinkedProject } from '../../util/projects/link';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { ProjectNotFound } from '../../util/errors-ts';
import { envTargetChoices, isValidEnvTarget } from '../../util/env/env-target';
import { normalizeRepeatableStringFilters } from '../../util/command-validation';
import { packageName } from '../../util/pkg-name';

const ALL_ENVS = ['production', 'preview', 'development'] as const;

interface ConnexClientIdentity {
  id: string;
  uid: string;
  name?: string;
}

interface ConnexClientProject {
  clientId: string;
  projectId: string;
  environments: string[];
}

export async function link(
  client: Client,
  args: string[],
  flags: {
    '--environment'?: string[];
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
      'Missing client ID or UID. Usage: vercel connex link <client>'
    );
    return 1;
  }

  // Validate environments. Empty → all three.
  const requestedEnvsRaw = normalizeRepeatableStringFilters(
    flags['--environment']
  );
  for (const env of requestedEnvsRaw) {
    if (!isValidEnvTarget(env)) {
      output.error(
        `Invalid environment ${chalk.bold(env)}. Allowed values: ${envTargetChoices
          .map(c => c.value)
          .join(', ')}.`
      );
      return 1;
    }
  }
  const environments =
    requestedEnvsRaw.length > 0 ? requestedEnvsRaw : [...ALL_ENVS];

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
    printError(err);
    return 1;
  }
  output.stopSpinner();

  const displayName = target.uid || target.name || target.id;

  // Pre-fetch existing link for the diff prompt.
  let existingLink: ConnexClientProject | undefined;
  try {
    existingLink = await client.fetch<ConnexClientProject>(
      `/v1/connex/clients/${encodeURIComponent(target.id)}/projects/${encodeURIComponent(projectId)}`
    );
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status !== 404) {
      printError(err);
      return 1;
    }
  }

  // Confirmation.
  if (!skipConfirmation && !client.stdin.isTTY) {
    output.error(
      'Confirmation required. Use `--yes` to skip the confirmation prompt.'
    );
    return 1;
  }

  if (!skipConfirmation) {
    if (existingLink) {
      const current = (existingLink.environments ?? []).join(', ') || '—';
      const next = environments.join(', ');
      output.log(
        `Connex client ${chalk.bold(displayName)} is already linked to ${chalk.bold(
          projectName
        )}.`
      );
      output.log(`  Current:  ${current}`);
      output.log(`  Will set: ${next}`);
    } else {
      output.log(
        `Connex client ${chalk.bold(displayName)} will be linked to ${chalk.bold(
          projectName
        )} for environments: ${environments.join(', ')}.`
      );
    }

    const confirmed = await client.input.confirm('Continue?', false);
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  // Upsert the link.
  output.spinner('Linking project…');
  try {
    await client.fetch<unknown>(
      `/v1/connex/clients/${encodeURIComponent(target.id)}/projects/${encodeURIComponent(projectId)}`,
      {
        method: 'POST',
        body: { environments },
      }
    );
  } catch (err: unknown) {
    output.stopSpinner();
    const status = (err as { status?: number }).status;
    if (status === 403) {
      output.error(
        `You don't have permission to link projects on this team. Owner or Member role required.`
      );
      return 1;
    }
    if (status === 404) {
      output.error(
        `No Connex client found for ${chalk.bold(displayName)}, or project ${chalk.bold(projectName)} is no longer accessible.`
      );
      return 1;
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
          environments,
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  output.success(
    `Linked Connex client ${chalk.bold(displayName)} to ${chalk.bold(projectName)} for environments: ${environments.join(', ')}.`
  );
  return 0;
}
