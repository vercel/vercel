import chalk from 'chalk';
import type { Project } from '@vercel-internals/types';
import type Client from '../../util/client';
import didYouMean from '../../util/did-you-mean';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';
import {
  buildCommandWithGlobalFlags,
  exitWithNonInteractiveError,
  outputActionRequired,
  outputAgentError,
  shouldEmitNonInteractiveCommandError,
} from '../../util/agent-output';
import {
  AGENT_ACTION,
  AGENT_REASON,
  AGENT_STATUS,
} from '../../util/agent-output-constants';
import { canPrompt } from '../../util/can-prompt';
import { quoteArg } from '../../util/flags/quote-arg';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import {
  parseSandboxRegionList,
  validateSandboxConfig,
} from '../../util/projects/sandbox-config';
import getScope from '../../util/get-scope';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import { stripSensitiveAuthArgs } from '../../util/redact-args';
import getTeamByIdOrSlug from '../../util/teams/get-team-by-id-or-slug';
import { ProjectUpdateTelemetryClient } from '../../util/telemetry/commands/project/update';
import output from '../../output-manager';
import { updateSubcommand } from './command';
import {
  advancedSettingDefinitions,
  autoDetectSettings,
  buildSettingDefinitions,
  displayAdvanced,
  frameworkSlugs,
  hasSetting,
  parseAdvanced,
  parseAutoDetectSettings,
  resolveFramework,
  settingOrder,
  validateSettingValue,
  type AutoDetectSetting,
  type ProjectSettingsUpdate,
  type ProvidedAdvancedSetting,
} from './update-setting-definitions';
import { computeSettingsChanges, patchProjectSettings } from './update-changes';
import { printChangePreview, writeUpdateResult } from './update-output';

function getUpdateCommand(framework = '<slug>') {
  return `project update <name> --framework ${framework}`;
}

function buildUpdateRetryCommand(
  client: Client,
  { interactive, withYes }: { interactive: boolean; withYes: boolean }
): string {
  const args = stripSensitiveAuthArgs(client.argv.slice(2));
  const nextArgs: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--yes' || arg === '-y') {
      continue;
    }
    if (
      interactive &&
      (arg === '--non-interactive' || arg.startsWith('--non-interactive='))
    ) {
      if (
        arg === '--non-interactive' &&
        (args[index + 1] === 'true' || args[index + 1] === 'false')
      ) {
        index++;
      }
      continue;
    }
    nextArgs.push(arg);
  }
  if (withYes) {
    nextArgs.push('--yes');
  }
  return getCommandNamePlain(nextArgs.map(quoteArg).join(' '));
}

function printUsageError(
  client: Client,
  message: string,
  exitCode: number,
  reason: 'invalid_arguments' | 'missing_arguments',
  suggestedCommand = getUpdateCommand()
): number {
  outputAgentError(
    client,
    {
      status: 'error',
      reason,
      message,
      next: [
        {
          command: buildCommandWithGlobalFlags(client.argv, suggestedCommand),
          when: 'Update project settings',
        },
      ],
    },
    exitCode
  );
  output.error(message);
  return exitCode;
}

function printPlanError(
  client: Client,
  message: string,
  teamOwned: boolean
): number {
  const nextCommand = teamOwned ? 'buy pro' : 'teams switch';
  outputAgentError(
    client,
    {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.PLAN_UPGRADE_REQUIRED,
      message,
      userActionRequired: true,
      next: [
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            nextCommand,
            undefined,
            { excludeFlags: ['--non-interactive', '--yes'] }
          ),
          when: teamOwned
            ? 'Upgrade this team interactively'
            : 'Switch to a Pro or Enterprise team',
        },
      ],
    },
    1
  );
  output.error(message);
  output.log(
    teamOwned
      ? `Upgrade with ${getCommandName('buy pro')}.`
      : `Switch teams with ${getCommandName('teams switch')}.`
  );
  return 1;
}

function printConfirmationRequiredError(
  client: Client,
  hasCostImpact: boolean
): number {
  const nextCommand = buildUpdateRetryCommand(client, {
    interactive: hasCostImpact,
    withYes: !hasCostImpact,
  });
  outputActionRequired(
    client,
    {
      status: AGENT_STATUS.ACTION_REQUIRED,
      reason: hasCostImpact
        ? AGENT_REASON.INTERACTIVE_CONFIRMATION_REQUIRED
        : AGENT_REASON.CONFIRMATION_REQUIRED,
      action: AGENT_ACTION.CONFIRMATION_REQUIRED,
      message: hasCostImpact
        ? 'These project settings may affect charges and require interactive confirmation.'
        : 'Updating project settings requires confirmation. Re-run with --yes to apply the changes.',
      userActionRequired: hasCostImpact,
      next: [
        {
          command: nextCommand,
          when: hasCostImpact
            ? 'Review and confirm the charge-sensitive settings in a terminal'
            : 'Apply the requested settings without prompting',
        },
      ],
    },
    1
  );
  output.error(
    hasCostImpact
      ? 'Confirmation required. These settings may affect charges and must be confirmed in an interactive terminal.'
      : 'Confirmation required. Re-run with --yes or in an interactive terminal.'
  );
  return 1;
}

function getSandboxValidationError(
  project: Project,
  requestedSettings: ProjectSettingsUpdate
): string | undefined {
  if (
    !hasSetting(requestedSettings, 'sandboxRegion') &&
    !hasSetting(requestedSettings, 'sandboxFailoverRegions')
  ) {
    return;
  }

  const mergedSandbox = { ...project.sandbox };
  if (hasSetting(requestedSettings, 'sandboxRegion')) {
    const region = requestedSettings.sandboxRegion;
    if (region === null || region === undefined) {
      delete mergedSandbox.region;
    } else {
      mergedSandbox.region = region;
    }
  }
  if (hasSetting(requestedSettings, 'sandboxFailoverRegions')) {
    mergedSandbox.failoverRegions =
      requestedSettings.sandboxFailoverRegions ?? [];
  }
  return validateSandboxConfig(mergedSandbox);
}

async function refreshProjectForNestedUpdate(
  client: Client,
  project: Project,
  body: Record<string, unknown>
): Promise<Project> {
  if (body.resourceConfig === undefined && body.sandbox === undefined) {
    return project;
  }
  return client.fetch<Project>(
    `/v9/projects/${encodeURIComponent(project.id)}`,
    { accountId: project.accountId }
  );
}

export default async function update(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new ProjectUpdateTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(updateSubcommand.options)
    );
  } catch (error) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: 'invalid_arguments',
        message: error instanceof Error ? error.message : String(error),
      },
      1
    );
    printError(error);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const [projectNameOrId] = args;
  const frameworkInput = flags['--framework'];
  const autoDetectInputs =
    (flags['--auto-detect'] as string[] | undefined) ?? [];

  telemetry.trackCliArgumentName(projectNameOrId);
  telemetry.trackCliOptionFramework(frameworkInput);
  telemetry.trackCliOptionBuildCommand(flags['--build-command']);
  telemetry.trackCliOptionDevCommand(flags['--dev-command']);
  telemetry.trackCliOptionInstallCommand(flags['--install-command']);
  telemetry.trackCliOptionOutputDirectory(flags['--output-directory']);
  telemetry.trackCliOptionRootDirectory(flags['--root-directory']);
  telemetry.trackCliOptionAutoDetect(
    flags['--auto-detect'] as [string] | undefined
  );
  telemetry.trackCliOptionSandboxRegion(flags['--sandbox-region']);
  telemetry.trackCliOptionSandboxFailoverRegions(
    flags['--sandbox-failover-regions']
  );
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);
  telemetry.trackCliFlagYes(flags['--yes']);
  telemetry.trackCliOptionFluidCompute(flags['--fluid-compute']);
  telemetry.trackCliOptionFunctionCpu(flags['--function-cpu']);
  telemetry.trackCliOptionBuildMachine(flags['--build-machine']);
  telemetry.trackCliOptionElasticConcurrency(flags['--elastic-concurrency']);
  telemetry.trackCliOptionNodeVersion(flags['--node-version']);

  if (args.length > 1) {
    return printUsageError(
      client,
      `Invalid number of arguments. Usage: ${getCommandNamePlain(
        'project update [name] [options]'
      )}`,
      2,
      'invalid_arguments'
    );
  }

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    return printUsageError(client, formatResult.error, 1, 'invalid_arguments');
  }

  const requestedSettings: ProjectSettingsUpdate = {};
  if (frameworkInput !== undefined) {
    const framework = resolveFramework(frameworkInput);
    if (!framework) {
      const normalizedInput = frameworkInput.trim().toLowerCase();
      const suggestion = normalizedInput
        ? (didYouMean(normalizedInput, frameworkSlugs, 0.7) as
            | string
            | undefined)
        : undefined;
      const message = suggestion
        ? `Unsupported framework preset ${JSON.stringify(frameworkInput)}. Did you mean ${JSON.stringify(suggestion)}?`
        : `Unsupported framework preset ${JSON.stringify(frameworkInput)}. Use a framework slug such as "nextjs", or "other" to clear the preset.`;
      return printUsageError(
        client,
        message,
        1,
        'invalid_arguments',
        getUpdateCommand(suggestion)
      );
    }
    requestedSettings.framework = framework.slug;
  }

  const requestedAutoDetect = parseAutoDetectSettings(autoDetectInputs);
  const autoDetectSet = new Set<AutoDetectSetting>();
  for (const setting of requestedAutoDetect) {
    if (!autoDetectSettings.includes(setting as AutoDetectSetting)) {
      const suggestion = setting
        ? (didYouMean(setting, autoDetectSettings, 0.7) as string | undefined)
        : undefined;
      const message = suggestion
        ? `Unknown auto-detect setting ${JSON.stringify(setting)}. Did you mean ${JSON.stringify(suggestion)}?`
        : `Unknown auto-detect setting ${JSON.stringify(setting)}. Accepted settings: ${autoDetectSettings.join(', ')}.`;
      return printUsageError(
        client,
        message,
        1,
        'invalid_arguments',
        `project update <name> --auto-detect ${suggestion ?? '<setting>'}`
      );
    }
    autoDetectSet.add(setting as AutoDetectSetting);
  }

  for (const definition of buildSettingDefinitions) {
    const value = flags[definition.flag] as string | undefined;
    if (value !== undefined && autoDetectSet.has(definition.autoDetect)) {
      return printUsageError(
        client,
        `Can't use "${definition.flag}" and "--auto-detect ${definition.autoDetect}" together. Choose one.`,
        2,
        'invalid_arguments',
        `project update <name> ${definition.flag} <value>`
      );
    }
    if (value !== undefined) {
      const validationError = validateSettingValue(definition, value);
      if (validationError) {
        return printUsageError(
          client,
          validationError,
          1,
          'invalid_arguments',
          `project update <name> ${definition.flag} <value>`
        );
      }
      requestedSettings[definition.key] = value;
    } else if (autoDetectSet.has(definition.autoDetect)) {
      requestedSettings[definition.key] = null;
    }
  }

  const sandboxRegionInput = flags['--sandbox-region'];
  if (sandboxRegionInput !== undefined) {
    const normalizedRegion = sandboxRegionInput.trim().toLowerCase();
    requestedSettings.sandboxRegion =
      normalizedRegion === '' ? null : normalizedRegion;
  }

  const sandboxFailoverInput = flags['--sandbox-failover-regions'];
  if (sandboxFailoverInput !== undefined) {
    requestedSettings.sandboxFailoverRegions =
      parseSandboxRegionList(sandboxFailoverInput);
  }

  const providedAdvanced: ProvidedAdvancedSetting[] = [];
  for (const definition of advancedSettingDefinitions) {
    const raw = (flags as Record<string, unknown>)[definition.flag] as
      | string
      | undefined;
    if (raw === undefined) {
      continue;
    }
    const result = parseAdvanced(definition, raw);
    if (!result.ok) {
      return printUsageError(
        client,
        result.message,
        1,
        'invalid_arguments',
        `project update <name> ${definition.flag} <value>`
      );
    }
    providedAdvanced.push({ definition, value: result.value });
  }

  if (
    settingOrder.every(key => !hasSetting(requestedSettings, key)) &&
    providedAdvanced.length === 0
  ) {
    return printUsageError(
      client,
      'Provide at least one setting option. Run "vercel project update --help" to see every available option.',
      2,
      'missing_arguments'
    );
  }

  let project: Project;
  try {
    project = await getProjectByCwdOrLink({
      client,
      commandName: 'project update',
      projectNameOrId,
      forReadOnlyCommand: true,
    });
  } catch (error) {
    exitWithNonInteractiveError(client, error, 1, { variant: 'update' });
    printError(error);
    return 1;
  }

  const sandboxError = getSandboxValidationError(project, requestedSettings);
  if (sandboxError) {
    return printUsageError(client, sandboxError, 1, 'invalid_arguments');
  }

  let changes = computeSettingsChanges(
    project,
    requestedSettings,
    providedAdvanced
  );
  const changeCount = changes.changedSettings.length;
  const gatedProvided = providedAdvanced.filter(
    ({ definition, value }) =>
      changes.changedSettings.includes(definition.key) &&
      definition.requiresPaidPlan?.(value)
  );

  if (gatedProvided.length > 0) {
    let team;
    let user;
    const teamOwned = project.accountId.startsWith('team_');
    try {
      if (projectNameOrId) {
        ({ team, user } = await getScope(client));
      } else {
        ({ team, user } = await getScope(client, { resolveLocalScope: true }));
      }
      if (teamOwned && team?.id !== project.accountId) {
        team = await getTeamByIdOrSlug(client, project.accountId);
      }
    } catch (error) {
      exitWithNonInteractiveError(client, error, 1, { variant: 'update' });
      printError(error);
      return 1;
    }
    const plan = (teamOwned ? team?.billing : user?.billing)?.plan;
    const hasPaidPlan = plan === 'pro' || plan === 'enterprise';
    if (!hasPaidPlan) {
      const phrases = gatedProvided.map(
        ({ definition, value }) =>
          `${definition.label} "${displayAdvanced(definition, value)}"`
      );
      const list =
        phrases.length === 1
          ? phrases[0]
          : `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`;
      const verb = phrases.length > 1 ? 'require' : 'requires';
      return printPlanError(
        client,
        `${list} ${verb} a Pro or Enterprise plan.`,
        teamOwned
      );
    }
  }

  const hasCostImpact = providedAdvanced.some(
    ({ definition, value }) =>
      changes.changedSettings.includes(definition.key) &&
      definition.hasCostImpact?.(value)
  );

  if (changeCount > 0) {
    const skipConfirmation = Boolean(flags['--yes']) && !hasCostImpact;
    if (!skipConfirmation) {
      if (!canPrompt(client)) {
        return printConfirmationRequiredError(client, hasCostImpact);
      }
      printChangePreview({
        project,
        previousSettings: changes.previousSettings,
        requestedSettings,
        changedSettings: changes.changedSettings,
        advancedRows: changes.advancedRows,
      });
      if (hasCostImpact) {
        printAlignedLabel(
          'Charges',
          'These settings may affect your Vercel charges.',
          { gutter: '!' }
        );
      }
      const confirmed = await client.input.confirm(
        `Update ${changeCount} ${changeCount === 1 ? 'setting' : 'settings'} for ${chalk.bold(project.name)}?`,
        false
      );
      if (!confirmed) {
        output.log('Canceled');
        return 0;
      }
    }
  }

  if (changeCount > 0) {
    try {
      project = await refreshProjectForNestedUpdate(
        client,
        project,
        changes.body
      );
    } catch (error) {
      exitWithNonInteractiveError(client, error, 1, { variant: 'update' });
      printError(error);
      return 1;
    }
    const refreshedSandboxError = getSandboxValidationError(
      project,
      requestedSettings
    );
    if (refreshedSandboxError) {
      return printUsageError(
        client,
        refreshedSandboxError,
        1,
        'invalid_arguments'
      );
    }
    changes = computeSettingsChanges(
      project,
      requestedSettings,
      providedAdvanced
    );
  }

  let updatedProject = project;
  if (changes.changedSettings.length > 0) {
    try {
      updatedProject = await patchProjectSettings(
        client,
        project,
        changes.body
      );
    } catch (error) {
      exitWithNonInteractiveError(client, error, 1, { variant: 'update' });
      printError(error);
      return 1;
    }
  }

  writeUpdateResult({
    changedSettings: changes.changedSettings,
    project: updatedProject,
    previousSettings: changes.previousSettings,
    requestedSettings,
    advancedRows: changes.advancedRows,
    asJson:
      formatResult.jsonOutput || shouldEmitNonInteractiveCommandError(client),
    client,
  });
  return 0;
}
