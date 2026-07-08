import { frameworkList, type Framework } from '@vercel/frameworks';
import type { JSONObject, Project } from '@vercel-internals/types';
import type Client from '../../util/client';
import didYouMean from '../../util/did-you-mean';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { getCommandNamePlain } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';
import {
  buildCommandWithGlobalFlags,
  exitWithNonInteractiveError,
  outputAgentError,
} from '../../util/agent-output';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import { ProjectUpdateTelemetryClient } from '../../util/telemetry/commands/project/update';
import output from '../../output-manager';
import { updateSubcommand } from './command';

const OTHER_FRAMEWORK_SLUG = 'other';
const MAX_SETTING_LENGTH = 256;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const frameworkSlugs = frameworkList.map(
  framework => framework.slug ?? OTHER_FRAMEWORK_SLUG
);

const buildSettingDefinitions = [
  {
    key: 'buildCommand',
    flag: '--build-command',
    autoDetect: 'build-command',
    label: 'Build Command',
  },
  {
    key: 'devCommand',
    flag: '--dev-command',
    autoDetect: 'dev-command',
    label: 'Dev Command',
  },
  {
    key: 'installCommand',
    flag: '--install-command',
    autoDetect: 'install-command',
    label: 'Install Command',
  },
  {
    key: 'outputDirectory',
    flag: '--output-directory',
    autoDetect: 'output-directory',
    label: 'Output Directory',
  },
] as const;

type BuildSettingDefinition = (typeof buildSettingDefinitions)[number];
type BuildSettingKey = BuildSettingDefinition['key'];
type AutoDetectSetting = BuildSettingDefinition['autoDetect'];
type ProjectSettingKey = 'framework' | BuildSettingKey;

interface ProjectSettingsUpdate {
  framework?: string | null;
  buildCommand?: string | null;
  devCommand?: string | null;
  installCommand?: string | null;
  outputDirectory?: string | null;
}

const settingOrder: readonly ProjectSettingKey[] = [
  'framework',
  ...buildSettingDefinitions.map(setting => setting.key),
];
const autoDetectSettings = buildSettingDefinitions.map(
  setting => setting.autoDetect
);
const settingLabels: Record<ProjectSettingKey, string> = {
  framework: 'Framework',
  buildCommand: 'Build Command',
  devCommand: 'Dev Command',
  installCommand: 'Install Command',
  outputDirectory: 'Output Directory',
};

function resolveFramework(input: string): Framework | undefined {
  const slug = input.trim().toLowerCase();
  return frameworkList.find(
    framework => (framework.slug ?? OTHER_FRAMEWORK_SLUG) === slug
  );
}

function formatFramework(slug: string | null): string {
  const framework = frameworkList.find(item => item.slug === slug);
  if (!framework) {
    return slug ?? OTHER_FRAMEWORK_SLUG;
  }
  return `${framework.name} (${framework.slug ?? OTHER_FRAMEWORK_SLUG})`;
}

function formatSettingValue(
  key: ProjectSettingKey,
  value: string | null
): string {
  if (key === 'framework') {
    return formatFramework(value);
  }
  if (value === null) {
    return 'Auto';
  }
  return value === '' ? '""' : value;
}

function getCurrentSetting(
  project: Project,
  key: ProjectSettingKey
): string | null {
  return project[key] ?? null;
}

function hasSetting(
  settings: ProjectSettingsUpdate,
  key: ProjectSettingKey
): boolean {
  return Object.prototype.hasOwnProperty.call(settings, key);
}

function getUpdateCommand(framework = '<slug>') {
  return `project update <name> --framework ${framework}`;
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

function validateSettingValue(
  definition: BuildSettingDefinition,
  value: string
): string | undefined {
  if (value.length > MAX_SETTING_LENGTH) {
    return `${definition.label} must be ${MAX_SETTING_LENGTH} characters or fewer.`;
  }
  if (CONTROL_CHARACTERS.test(value)) {
    return `${definition.label} can't contain control characters.`;
  }
}

function parseAutoDetectSettings(inputs: string[]): string[] {
  return inputs.flatMap(input => input.split(',')).map(input => input.trim());
}

function writeResult({
  changedSettings,
  project,
  previousSettings,
  requestedSettings,
  asJson,
  client,
}: {
  changedSettings: ProjectSettingKey[];
  project: Project;
  previousSettings: ProjectSettingsUpdate;
  requestedSettings: ProjectSettingsUpdate;
  asJson: boolean;
  client: Client;
}) {
  const changed = changedSettings.length > 0;
  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        {
          changed,
          changedSettings,
          projectId: project.id,
          projectName: project.name,
          settings: requestedSettings,
        },
        null,
        2
      )}\n`
    );
    return;
  }

  printAlignedLabel(changed ? 'Updated' : 'Unchanged', 'Project Settings', {
    gutter: '✓',
  });
  printAlignedLabel('Project', project.name);
  for (const key of settingOrder) {
    if (!hasSetting(requestedSettings, key)) {
      continue;
    }
    const previous = previousSettings[key] ?? null;
    const next = requestedSettings[key] ?? null;
    const value = changedSettings.includes(key)
      ? `${formatSettingValue(key, previous)} → ${formatSettingValue(key, next)}`
      : formatSettingValue(key, next);
    printAlignedLabel(settingLabels[key], value);
  }
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
  telemetry.trackCliOptionAutoDetect(
    flags['--auto-detect'] as [string] | undefined
  );
  telemetry.trackCliOptionFormat(flags['--format']);

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

  if (settingOrder.every(key => !hasSetting(requestedSettings, key))) {
    return printUsageError(
      client,
      'Provide at least one setting option: --framework, --build-command, --dev-command, --install-command, --output-directory, or --auto-detect.',
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

  const previousSettings: ProjectSettingsUpdate = {};
  const changedSettings: ProjectSettingKey[] = [];
  const changedUpdates: ProjectSettingsUpdate = {};
  for (const key of settingOrder) {
    if (!hasSetting(requestedSettings, key)) {
      continue;
    }
    const previous = getCurrentSetting(project, key);
    const next = requestedSettings[key] ?? null;
    previousSettings[key] = previous;
    if (previous !== next) {
      changedSettings.push(key);
      Object.assign(changedUpdates, { [key]: next });
    }
  }

  let updatedProject = project;
  if (changedSettings.length > 0) {
    try {
      updatedProject = await client.fetch<Project>(
        `/v9/projects/${encodeURIComponent(project.id)}`,
        {
          method: 'PATCH',
          body: changedUpdates as JSONObject,
        }
      );
    } catch (error) {
      exitWithNonInteractiveError(client, error, 1, { variant: 'update' });
      printError(error);
      return 1;
    }
  }

  writeResult({
    changedSettings,
    project: updatedProject,
    previousSettings,
    requestedSettings,
    asJson: formatResult.jsonOutput,
    client,
  });
  return 0;
}
