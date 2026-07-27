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
import {
  getCustomEnvironments,
  pickCustomEnvironment,
} from '../../util/target/get-custom-environments';
import { normalizeRepeatableStringFilters } from '../../util/command-validation';
import { sanitizeForTerminal } from '../../util/connex/sanitize';
import { packageName } from '../../util/pkg-name';
import {
  MAX_TRIGGER_DESTINATIONS,
  buildTriggerDestination,
  findMatchingDestination,
  formatDestination,
  patchTriggerDestinations,
} from '../../util/connex/trigger-destinations';
import type {
  ConnexClientIdentity,
  ConnexClientProject,
  ConnexTriggerDestination,
} from './types';

const ALL_ENVS = ['production', 'preview', 'development'] as const;

async function resolveRequestedEnvironments(
  client: Client,
  projectId: string,
  projectName: string,
  requestedEnvironments: string[]
): Promise<string[] | undefined> {
  if (requestedEnvironments.length === 0) {
    return [...ALL_ENVS];
  }

  const customEnvironmentInputs = requestedEnvironments.filter(
    environment => !isValidEnvTarget(environment)
  );
  const customEnvironments =
    customEnvironmentInputs.length > 0
      ? await getCustomEnvironments(client, projectId)
      : [];
  const resolvedEnvironments = new Set<string>();

  for (const environment of requestedEnvironments) {
    if (isValidEnvTarget(environment)) {
      resolvedEnvironments.add(environment);
      continue;
    }

    const customEnvironment = pickCustomEnvironment(
      customEnvironments,
      environment
    );
    if (!customEnvironment) {
      output.error(
        `Invalid environment ${chalk.bold(environment)} for project ${chalk.bold(projectName)}. Use ${envTargetChoices
          .map(choice => choice.value)
          .join(', ')}, or a custom environment slug or ID from that project.`
      );
      return undefined;
    }
    resolvedEnvironments.add(customEnvironment.id);
  }

  return [...resolvedEnvironments];
}

function envSetsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const aSet = new Set(a);
  return b.every(env => aSet.has(env));
}

function getAttachmentEnvironments(
  requestedEnvironments: readonly string[],
  projectId: string,
  destinations: readonly ConnexTriggerDestination[]
): string[] {
  const environments = new Set(requestedEnvironments);

  // The API adds custom environments required by trigger destinations to the
  // connector-project link. Preserve those implicit entries so a repeat attach
  // remains a no-op and an attachment update does not remove trigger access.
  for (const destination of destinations) {
    if (
      destination.projectId === projectId &&
      destination.customEnvironmentId !== undefined
    ) {
      environments.add(destination.customEnvironmentId);
    }
  }

  return [...environments];
}

export async function attach(
  client: Client,
  args: string[],
  flags: {
    '--environment'?: string[];
    '--project'?: string;
    '--triggers'?: boolean;
    '--trigger-branch'?: string;
    '--trigger-environment'?: string;
    '--trigger-path'?: string;
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
  const withTriggers = !!flags['--triggers'];
  const triggerBranch = flags['--trigger-branch'];
  const triggerEnvironment = flags['--trigger-environment'];
  const triggerPath = flags['--trigger-path'];

  if (asJson && !skipConfirmation) {
    output.error('--format=json requires --yes to skip confirmation prompts');
    return 1;
  }

  if (
    !withTriggers &&
    (triggerBranch !== undefined ||
      triggerEnvironment !== undefined ||
      triggerPath !== undefined)
  ) {
    output.error(
      '--trigger-branch, --trigger-environment, and --trigger-path require --triggers to also be set.'
    );
    return 1;
  }

  if (triggerBranch !== undefined && triggerEnvironment !== undefined) {
    output.error(
      '--trigger-branch and --trigger-environment are mutually exclusive.'
    );
    return 1;
  }

  if (triggerEnvironment !== undefined && triggerEnvironment.trim() === '') {
    output.error('--trigger-environment must not be empty.');
    return 1;
  }

  const clientIdOrUid = args[0];
  if (!clientIdOrUid) {
    output.error(
      'Missing connector ID or UID. Usage: vercel connect attach <connector>'
    );
    return 1;
  }

  // Custom environment slugs are project-scoped, so resolve the project before
  // validating these values. An omitted option still means all three built-ins.
  const requestedEnvsRaw = normalizeRepeatableStringFilters(
    flags['--environment']
  );

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
    projectName = sanitizeForTerminal(resolvedProject.name);
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
    projectName = sanitizeForTerminal(linked.project.name);
  }

  let environments: string[] | undefined;
  try {
    environments = await resolveRequestedEnvironments(
      client,
      projectId,
      projectName,
      requestedEnvsRaw
    );
  } catch (err: unknown) {
    printError(err);
    return 1;
  }
  if (!environments) {
    return 1;
  }

  // Resolve client identity → canonical id + display name. The base GET
  // response also carries supportsTriggers / triggers / triggerDestinations,
  // which we need for the --triggers path.
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

  const displayName = sanitizeForTerminal(
    target.uid || target.name || target.id
  );

  // Pre-flight: trigger-destination planning.
  let desiredDestination: ConnexTriggerDestination | undefined;
  let triggerAlreadyRegistered = false;
  let triggersEnabledOnConnector = true;
  if (withTriggers) {
    if (target.supportsTriggers === false) {
      output.error(
        `Connector ${chalk.bold(displayName)} does not support triggers (only Slack supports incoming webhooks today).`
      );
      return 1;
    }

    triggersEnabledOnConnector = target.triggers?.enabled === true;

    let customEnvironmentId: string | undefined;
    if (triggerEnvironment !== undefined) {
      let customEnvironments;
      try {
        customEnvironments = await getCustomEnvironments(client, projectId);
      } catch (err: unknown) {
        printError(err);
        return 1;
      }
      const customEnvironment = pickCustomEnvironment(
        customEnvironments,
        triggerEnvironment
      );
      if (!customEnvironment) {
        output.error(
          `Unknown trigger environment ${chalk.bold(triggerEnvironment)} for project ${chalk.bold(projectName)}. Use a custom environment slug or stable ID from that project.`
        );
        return 1;
      }
      customEnvironmentId = customEnvironment.id;
    }

    desiredDestination = buildTriggerDestination({
      projectId,
      customEnvironmentId,
      branch: triggerBranch,
      path: triggerPath,
    });

    const currentDestinations = target.triggerDestinations ?? [];
    triggerAlreadyRegistered =
      findMatchingDestination(currentDestinations, desiredDestination) !==
      undefined;

    if (
      !triggerAlreadyRegistered &&
      currentDestinations.length >= MAX_TRIGGER_DESTINATIONS
    ) {
      output.error(
        `Connector ${chalk.bold(displayName)} already has ${MAX_TRIGGER_DESTINATIONS} trigger destinations. Remove one in the dashboard before adding a new one.`
      );
      return 1;
    }
  }

  // Pre-fetch existing attachment for the diff prompt and the no-op check.
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

  const attachmentEnvironments = getAttachmentEnvironments(
    environments,
    projectId,
    target.triggerDestinations ?? []
  );
  const attachmentMatches =
    existingAttachment !== undefined &&
    envSetsEqual(existingAttachment.environments ?? [], attachmentEnvironments);
  const shouldAttach = !attachmentMatches;
  const shouldRegisterTrigger = withTriggers && !triggerAlreadyRegistered;

  // Total no-op: nothing to do.
  if (!shouldAttach && !shouldRegisterTrigger) {
    if (asJson) {
      client.stdout.write(
        `${JSON.stringify(
          {
            clientId: target.id,
            uid: target.uid,
            projectId,
            environments: attachmentEnvironments,
            triggerDestination: withTriggers ? desiredDestination : undefined,
            unchanged: true,
          },
          null,
          2
        )}\n`
      );
      return 0;
    }
    const triggerPart = withTriggers
      ? ` (trigger destination already registered)`
      : '';
    output.log(
      `Connector ${chalk.bold(displayName)} is already attached to ${chalk.bold(
        projectName
      )} for environments: ${attachmentEnvironments.join(', ')}${triggerPart}. Nothing to do.`
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
    if (shouldAttach) {
      if (existingAttachment) {
        const current =
          (existingAttachment.environments ?? []).join(', ') || '—';
        const next = attachmentEnvironments.join(', ');
        output.log(
          `Connector ${chalk.bold(displayName)} is already attached to ${chalk.bold(
            projectName
          )}.`
        );
        output.log(`  Current:  ${current}`);
        output.log(`  Will set: ${next}`);
      } else {
        output.log(
          `Connector ${chalk.bold(displayName)} will be attached to ${chalk.bold(
            projectName
          )} for environments: ${attachmentEnvironments.join(', ')}.`
        );
      }
    }

    if (shouldRegisterTrigger && desiredDestination) {
      output.log(
        `Will register as trigger destination: ${formatDestination(desiredDestination)}.`
      );
      if (!triggersEnabledOnConnector) {
        output.warn(
          `Triggers are not enabled on this connector. The destination will be registered, but no events will flow until the connector is recreated with triggers enabled.`
        );
      }
    }

    const confirmed = await client.input.confirm('Continue?', false);
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  // Upsert the attachment.
  if (shouldAttach) {
    output.spinner('Attaching project…');
    try {
      await client.fetch<unknown>(
        `/v1/connect/connectors/${encodeURIComponent(target.id)}/projects/${encodeURIComponent(projectId)}`,
        {
          method: 'POST',
          body: { environments: attachmentEnvironments },
        }
      );
    } catch (err: unknown) {
      output.stopSpinner();
      const status = (err as { status?: number }).status;
      if (status === 403) {
        output.error(
          `You don't have permission to attach projects on this team. Owner or Member role required.`
        );
        return 1;
      }
      if (status === 404) {
        output.error(
          `No connector found for ${chalk.bold(displayName)}, or project ${chalk.bold(projectName)} is no longer accessible.`
        );
        return 1;
      }
      printError(err);
      return 1;
    }
    output.stopSpinner();
  }

  // Register the trigger destination (PATCH replaces the full list, so merge first).
  if (shouldRegisterTrigger && desiredDestination) {
    const merged: ConnexTriggerDestination[] = [
      ...(target.triggerDestinations ?? []),
      desiredDestination,
    ];
    output.spinner('Registering trigger destination…');
    try {
      await patchTriggerDestinations(client, target.id, merged);
    } catch (err: unknown) {
      output.stopSpinner();
      const status = (err as { status?: number }).status;
      if (status === 403) {
        output.error(
          `You don't have permission to update trigger destinations on this team. Owner or Member role required.`
        );
        return 1;
      }
      if (status === 404) {
        output.error(
          `Trigger destinations are not available for this team (the connex-triggers feature is not enabled).`
        );
        return 1;
      }
      printError(err);
      return 1;
    }
    output.stopSpinner();
  }

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        {
          clientId: target.id,
          uid: target.uid,
          projectId,
          environments: attachmentEnvironments,
          triggerDestination: withTriggers ? desiredDestination : undefined,
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  if (shouldAttach) {
    output.success(
      `Attached connector ${chalk.bold(displayName)} to ${chalk.bold(projectName)} for environments: ${attachmentEnvironments.join(', ')}.`
    );
  }
  if (shouldRegisterTrigger && desiredDestination) {
    output.success(
      `Registered ${chalk.bold(projectName)} as a trigger destination (${formatDestination(desiredDestination)}).`
    );
  }
  return 0;
}
