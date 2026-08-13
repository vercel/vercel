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
  {
    key: 'rootDirectory',
    flag: '--root-directory',
    autoDetect: 'root-directory',
    label: 'Root Directory',
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
  rootDirectory?: string | null;
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
  rootDirectory: 'Root Directory',
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

// --- Advanced project settings (compute / functions) ---
//
// These flags map to the nested `resourceConfig` and `sandbox` objects and to
// top-level project fields on the public project PATCH schema. Each definition
// parses and validates its flag value locally before any request, reads the
// current value for change detection and preview, and applies the change to a
// sparse PATCH body so only the fields the user provided are sent.
const NODE_VERSIONS = [
  '24.x',
  '22.x',
  '20.x',
  '18.x',
  '16.x',
  '14.x',
  '12.x',
  '10.x',
] as const;
const FUNCTION_CPU_TIERS = [
  'standard_legacy',
  'standard',
  'performance',
  'performance_xl',
] as const;
const BUILD_MACHINE_TYPES = [
  'basic',
  'standard',
  'enhanced',
  'turbo',
  'elastic',
] as const;
const SANDBOX_REGIONS = ['iad1', 'sfo1', 'cle1'] as const;
const MIN_FUNCTION_TIMEOUT = 1;
const MAX_FUNCTION_TIMEOUT = 900;

type AdvancedValue = string | number | boolean | string[];
type PatchBody = Record<string, unknown>;
type AdvancedParseResult =
  | { ok: true; value: AdvancedValue }
  | { ok: false; message: string };

// Subset of project fields the advanced flags read for change detection and
// merge. These exist on the API response but are not modeled on the CLI
// `Project` type, so they are read through this narrow view.
interface AdvancedProjectFields {
  resourceConfig?: {
    fluid?: boolean;
    functionDefaultRegions?: string[];
    functionDefaultMemoryType?: string;
    functionDefaultTimeout?: number;
    elasticConcurrencyEnabled?: boolean;
    buildMachineType?: string;
  } | null;
  sandbox?: { region?: string; failoverRegions?: string[] } | null;
  gitComments?: { onPullRequest?: boolean; onCommit?: boolean } | null;
  sourceFilesOutsideRootDirectory?: boolean;
  enableAffectedProjectsDeployments?: boolean;
  gitLFS?: boolean;
  commandForIgnoringBuildStep?: string | null;
  oidcTokenConfig?: { enabled?: boolean; issuerMode?: string } | null;
  directoryListing?: boolean;
  protectedSourcemaps?: boolean;
  previewDeploymentSuffix?: string | null;
  enablePreviewFeedback?: boolean | null;
  enableProductionFeedback?: boolean | null;
  autoAssignCustomDomains?: boolean;
}

interface AdvancedSettingDefinition {
  key: string;
  flag: string;
  label: string;
  parse: (raw: string) => AdvancedParseResult;
  read: (project: Project) => AdvancedValue | null | undefined;
  apply: (body: PatchBody, value: AdvancedValue, project: Project) => void;
  display: (value: AdvancedValue | null | undefined) => string;
  // Optional override when a single flag maps to more than one project field
  // (for example `--toolbar` toggling both preview and production feedback).
  changed?: (project: Project, value: AdvancedValue) => boolean;
}

interface AdvancedPreviewRow {
  label: string;
  previous: string;
  next: string;
  changed: boolean;
}

interface ProvidedAdvancedSetting {
  definition: AdvancedSettingDefinition;
  value: AdvancedValue;
}

function getAdvancedFields(project: Project): AdvancedProjectFields {
  return project as Project & AdvancedProjectFields;
}

function ensureResourceConfig(body: PatchBody): Record<string, unknown> {
  const resourceConfig =
    (body.resourceConfig as Record<string, unknown> | undefined) ?? {};
  body.resourceConfig = resourceConfig;
  return resourceConfig;
}

// The public schema requires both `onPullRequest` and `onCommit` whenever
// `gitComments` is sent, so seed the object from the current project (both
// flags share it) and let each flag override only the field it targets.
function ensureGitComments(
  body: PatchBody,
  project: Project
): { onPullRequest: boolean; onCommit: boolean } {
  const current = getAdvancedFields(project).gitComments;
  const gitComments = (body.gitComments as
    | { onPullRequest: boolean; onCommit: boolean }
    | undefined) ?? {
    onPullRequest: current?.onPullRequest ?? false,
    onCommit: current?.onCommit ?? false,
  };
  body.gitComments = gitComments;
  return gitComments;
}

function parseOnOff(flag: string, raw: string): AdvancedParseResult {
  if (raw === 'on') {
    return { ok: true, value: true };
  }
  if (raw === 'off') {
    return { ok: true, value: false };
  }
  return { ok: false, message: `${flag} must be "on" or "off".` };
}

function parseEnumValue(
  label: string,
  raw: string,
  allowed: readonly string[]
): AdvancedParseResult {
  if (allowed.includes(raw)) {
    return { ok: true, value: raw };
  }
  return {
    ok: false,
    message: `${label} must be one of: ${allowed.join(', ')}.`,
  };
}

function displayOnOff(value: AdvancedValue | null | undefined): string {
  if (value === true) {
    return 'on';
  }
  if (value === false) {
    return 'off';
  }
  return 'Auto';
}

function displayValue(value: AdvancedValue | null | undefined): string {
  if (value === null || value === undefined) {
    return 'Auto';
  }
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return String(value);
}

const advancedSettingDefinitions: readonly AdvancedSettingDefinition[] = [
  {
    key: 'fluid',
    flag: '--fluid-compute',
    label: 'Fluid Compute',
    parse: raw => parseOnOff('--fluid-compute', raw),
    read: project => getAdvancedFields(project).resourceConfig?.fluid,
    apply: (body, value) => {
      ensureResourceConfig(body).fluid = value as boolean;
    },
    display: displayOnOff,
  },
  {
    key: 'functionDefaultRegions',
    flag: '--function-region',
    label: 'Function Regions',
    parse: raw => {
      const regions = raw
        .split(',')
        .map(region => region.trim())
        .filter(region => region.length > 0);
      if (regions.length === 0) {
        return {
          ok: false,
          message: '--function-region requires at least one region.',
        };
      }
      for (const region of regions) {
        if (region.length < 3 || region.length > 4) {
          return {
            ok: false,
            message: `Function region "${region}" must be a 3-4 character region such as "iad1".`,
          };
        }
      }
      return { ok: true, value: regions };
    },
    read: project =>
      getAdvancedFields(project).resourceConfig?.functionDefaultRegions,
    apply: (body, value) => {
      ensureResourceConfig(body).functionDefaultRegions = value as string[];
    },
    display: displayValue,
  },
  {
    key: 'functionDefaultMemoryType',
    flag: '--function-cpu',
    label: 'Function CPU',
    parse: raw => parseEnumValue('Function CPU', raw, FUNCTION_CPU_TIERS),
    read: project =>
      getAdvancedFields(project).resourceConfig?.functionDefaultMemoryType,
    apply: (body, value) => {
      ensureResourceConfig(body).functionDefaultMemoryType = value as string;
    },
    display: displayValue,
  },
  {
    key: 'functionDefaultTimeout',
    flag: '--function-timeout',
    label: 'Function Timeout',
    parse: raw => {
      const trimmed = raw.trim();
      if (!/^\d+$/.test(trimmed)) {
        return {
          ok: false,
          message: `Function timeout must be an integer between ${MIN_FUNCTION_TIMEOUT} and ${MAX_FUNCTION_TIMEOUT} seconds.`,
        };
      }
      const seconds = Number(trimmed);
      if (seconds < MIN_FUNCTION_TIMEOUT || seconds > MAX_FUNCTION_TIMEOUT) {
        return {
          ok: false,
          message: `Function timeout must be between ${MIN_FUNCTION_TIMEOUT} and ${MAX_FUNCTION_TIMEOUT} seconds.`,
        };
      }
      return { ok: true, value: seconds };
    },
    read: project =>
      getAdvancedFields(project).resourceConfig?.functionDefaultTimeout,
    apply: (body, value) => {
      ensureResourceConfig(body).functionDefaultTimeout = value as number;
    },
    display: value => (typeof value === 'number' ? `${value}s` : 'Auto'),
  },
  {
    key: 'sandboxRegion',
    flag: '--sandbox-region',
    label: 'Sandbox Region',
    parse: raw => parseEnumValue('Sandbox region', raw, SANDBOX_REGIONS),
    read: project => getAdvancedFields(project).sandbox?.region,
    apply: (body, value, project) => {
      body.sandbox = {
        ...(getAdvancedFields(project).sandbox ?? {}),
        region: value as string,
      };
    },
    display: displayValue,
  },
  {
    key: 'buildMachineType',
    flag: '--build-machine',
    label: 'Build Machine',
    parse: raw => parseEnumValue('Build machine', raw, BUILD_MACHINE_TYPES),
    read: project =>
      getAdvancedFields(project).resourceConfig?.buildMachineType,
    apply: (body, value) => {
      ensureResourceConfig(body).buildMachineType = value as string;
    },
    display: displayValue,
  },
  {
    key: 'elasticConcurrencyEnabled',
    flag: '--elastic-concurrency',
    label: 'Elastic Concurrency',
    parse: raw => parseOnOff('--elastic-concurrency', raw),
    read: project =>
      getAdvancedFields(project).resourceConfig?.elasticConcurrencyEnabled,
    apply: (body, value) => {
      ensureResourceConfig(body).elasticConcurrencyEnabled = value as boolean;
    },
    display: displayOnOff,
  },
  {
    key: 'nodeVersion',
    flag: '--node-version',
    label: 'Node.js Version',
    parse: raw => parseEnumValue('Node.js version', raw, NODE_VERSIONS),
    read: project => project.nodeVersion,
    apply: (body, value) => {
      body.nodeVersion = value as string;
    },
    display: displayValue,
  },
  {
    key: 'commandForIgnoringBuildStep',
    flag: '--ignore-build-command',
    label: 'Ignored Build Step',
    parse: raw => {
      if (raw.length > MAX_SETTING_LENGTH) {
        return {
          ok: false,
          message: `Ignored Build Step command must be ${MAX_SETTING_LENGTH} characters or fewer.`,
        };
      }
      if (CONTROL_CHARACTERS.test(raw)) {
        return {
          ok: false,
          message:
            "Ignored Build Step command can't contain control characters.",
        };
      }
      return { ok: true, value: raw };
    },
    read: project => getAdvancedFields(project).commandForIgnoringBuildStep,
    apply: (body, value) => {
      body.commandForIgnoringBuildStep = value as string;
    },
    display: value => (value === '' ? '""' : displayValue(value)),
  },
  {
    key: 'sourceFilesOutsideRootDirectory',
    flag: '--include-files-outside-root',
    label: 'Files Outside Root',
    parse: raw => parseOnOff('--include-files-outside-root', raw),
    read: project => getAdvancedFields(project).sourceFilesOutsideRootDirectory,
    apply: (body, value) => {
      body.sourceFilesOutsideRootDirectory = value as boolean;
    },
    display: displayOnOff,
  },
  {
    key: 'enableAffectedProjectsDeployments',
    flag: '--affected-projects',
    label: 'Affected Projects',
    parse: raw => parseOnOff('--affected-projects', raw),
    read: project =>
      getAdvancedFields(project).enableAffectedProjectsDeployments,
    apply: (body, value) => {
      body.enableAffectedProjectsDeployments = value as boolean;
    },
    display: displayOnOff,
  },
  {
    key: 'gitLFS',
    flag: '--git-lfs',
    label: 'Git LFS',
    parse: raw => parseOnOff('--git-lfs', raw),
    read: project => getAdvancedFields(project).gitLFS,
    apply: (body, value) => {
      body.gitLFS = value as boolean;
    },
    display: displayOnOff,
  },
  {
    key: 'gitCommentOnPullRequest',
    flag: '--git-comment-on-pr',
    label: 'Git Comments on PR',
    parse: raw => parseOnOff('--git-comment-on-pr', raw),
    read: project => getAdvancedFields(project).gitComments?.onPullRequest,
    apply: (body, value, project) => {
      ensureGitComments(body, project).onPullRequest = value as boolean;
    },
    display: displayOnOff,
  },
  {
    key: 'gitCommentOnCommit',
    flag: '--git-comment-on-commit',
    label: 'Git Comments on Commit',
    parse: raw => parseOnOff('--git-comment-on-commit', raw),
    read: project => getAdvancedFields(project).gitComments?.onCommit,
    apply: (body, value, project) => {
      ensureGitComments(body, project).onCommit = value as boolean;
    },
    display: displayOnOff,
  },
  {
    key: 'oidcIssuerMode',
    flag: '--oidc-issuer-mode',
    label: 'OIDC Issuer Mode',
    parse: raw => parseEnumValue('OIDC issuer mode', raw, ['team', 'global']),
    read: project => getAdvancedFields(project).oidcTokenConfig?.issuerMode,
    apply: (body, value) => {
      body.oidcTokenConfig = { issuerMode: value as string };
    },
    display: displayValue,
  },
  {
    key: 'directoryListing',
    flag: '--directory-listing',
    label: 'Directory Listing',
    parse: raw => parseOnOff('--directory-listing', raw),
    read: project => getAdvancedFields(project).directoryListing,
    apply: (body, value) => {
      body.directoryListing = value as boolean;
    },
    display: displayOnOff,
  },
  {
    key: 'protectedSourcemaps',
    flag: '--source-protection',
    label: 'Source Protection',
    parse: raw => parseOnOff('--source-protection', raw),
    read: project => getAdvancedFields(project).protectedSourcemaps,
    apply: (body, value) => {
      body.protectedSourcemaps = value as boolean;
    },
    display: displayOnOff,
  },
  {
    key: 'previewDeploymentSuffix',
    flag: '--preview-suffix',
    label: 'Preview Suffix',
    parse: raw => {
      if (raw.length > 253) {
        return {
          ok: false,
          message: 'Preview suffix must be 253 characters or fewer.',
        };
      }
      if (CONTROL_CHARACTERS.test(raw)) {
        return {
          ok: false,
          message: "Preview suffix can't contain control characters.",
        };
      }
      return { ok: true, value: raw };
    },
    read: project => getAdvancedFields(project).previewDeploymentSuffix,
    apply: (body, value) => {
      body.previewDeploymentSuffix = value as string;
    },
    display: value => (value === '' ? '""' : displayValue(value)),
  },
  {
    key: 'toolbar',
    flag: '--toolbar',
    label: 'Vercel Toolbar',
    parse: raw => parseOnOff('--toolbar', raw),
    read: project =>
      getAdvancedFields(project).enablePreviewFeedback ??
      getAdvancedFields(project).enableProductionFeedback ??
      undefined,
    apply: (body, value) => {
      body.enablePreviewFeedback = value as boolean;
      body.enableProductionFeedback = value as boolean;
    },
    display: displayOnOff,
    changed: (project, value) => {
      const fields = getAdvancedFields(project);
      return (
        (fields.enablePreviewFeedback ?? undefined) !== value ||
        (fields.enableProductionFeedback ?? undefined) !== value
      );
    },
  },
  {
    key: 'autoExposeSystemEnvs',
    flag: '--expose-system-envs',
    label: 'Expose System Envs',
    parse: raw => parseOnOff('--expose-system-envs', raw),
    read: project => project.autoExposeSystemEnvs,
    apply: (body, value) => {
      body.autoExposeSystemEnvs = value as boolean;
    },
    display: displayOnOff,
  },
  {
    key: 'autoAssignCustomDomains',
    flag: '--auto-assign-custom-domains',
    label: 'Auto-assign Domains',
    parse: raw => parseOnOff('--auto-assign-custom-domains', raw),
    read: project => getAdvancedFields(project).autoAssignCustomDomains,
    apply: (body, value) => {
      body.autoAssignCustomDomains = value as boolean;
    },
    display: displayOnOff,
  },
];

function advancedValuesEqual(
  a: AdvancedValue | null | undefined,
  b: AdvancedValue | null | undefined
): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }
  return a === b;
}

function collectAdvancedSettings(
  flags: Record<string, unknown>
):
  | { ok: true; provided: ProvidedAdvancedSetting[] }
  | { ok: false; flag: string; message: string } {
  const provided: ProvidedAdvancedSetting[] = [];
  for (const definition of advancedSettingDefinitions) {
    const raw = flags[definition.flag] as string | undefined;
    if (raw === undefined) {
      continue;
    }
    const result = definition.parse(raw);
    if (!result.ok) {
      return { ok: false, flag: definition.flag, message: result.message };
    }
    provided.push({ definition, value: result.value });
  }
  return { ok: true, provided };
}

function writeResult({
  changedSettings,
  project,
  previousSettings,
  requestedSettings,
  advancedRows,
  advancedSettings,
  asJson,
  client,
}: {
  changedSettings: string[];
  project: Project;
  previousSettings: ProjectSettingsUpdate;
  requestedSettings: ProjectSettingsUpdate;
  advancedRows: AdvancedPreviewRow[];
  advancedSettings: Record<string, AdvancedValue>;
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
          settings: { ...requestedSettings, ...advancedSettings },
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
  for (const row of advancedRows) {
    const value = row.changed ? `${row.previous} → ${row.next}` : row.next;
    printAlignedLabel(row.label, value);
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
  telemetry.trackCliOptionRootDirectory(flags['--root-directory']);
  telemetry.trackCliOptionAutoDetect(
    flags['--auto-detect'] as [string] | undefined
  );
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliOptionFluidCompute(flags['--fluid-compute']);
  telemetry.trackCliOptionFunctionRegion(flags['--function-region']);
  telemetry.trackCliOptionFunctionCpu(flags['--function-cpu']);
  telemetry.trackCliOptionFunctionTimeout(flags['--function-timeout']);
  telemetry.trackCliOptionSandboxRegion(flags['--sandbox-region']);
  telemetry.trackCliOptionBuildMachine(flags['--build-machine']);
  telemetry.trackCliOptionElasticConcurrency(flags['--elastic-concurrency']);
  telemetry.trackCliOptionNodeVersion(flags['--node-version']);
  telemetry.trackCliOptionIgnoreBuildCommand(flags['--ignore-build-command']);
  telemetry.trackCliOptionIncludeFilesOutsideRoot(
    flags['--include-files-outside-root']
  );
  telemetry.trackCliOptionAffectedProjects(flags['--affected-projects']);
  telemetry.trackCliOptionGitLfs(flags['--git-lfs']);
  telemetry.trackCliOptionGitCommentOnPr(flags['--git-comment-on-pr']);
  telemetry.trackCliOptionGitCommentOnCommit(flags['--git-comment-on-commit']);
  telemetry.trackCliOptionOidcIssuerMode(flags['--oidc-issuer-mode']);
  telemetry.trackCliOptionDirectoryListing(flags['--directory-listing']);
  telemetry.trackCliOptionSourceProtection(flags['--source-protection']);
  telemetry.trackCliOptionPreviewSuffix(flags['--preview-suffix']);
  telemetry.trackCliOptionToolbar(flags['--toolbar']);
  telemetry.trackCliOptionExposeSystemEnvs(flags['--expose-system-envs']);
  telemetry.trackCliOptionAutoAssignCustomDomains(
    flags['--auto-assign-custom-domains']
  );

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

  const advancedResult = collectAdvancedSettings(flags);
  if (!advancedResult.ok) {
    return printUsageError(
      client,
      advancedResult.message,
      1,
      'invalid_arguments',
      `project update <name> ${advancedResult.flag} <value>`
    );
  }
  const providedAdvanced = advancedResult.provided;

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

  const previousSettings: ProjectSettingsUpdate = {};
  const changedSettings: string[] = [];
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

  const body: PatchBody = { ...changedUpdates };
  const advancedRows: AdvancedPreviewRow[] = [];
  const advancedSettings: Record<string, AdvancedValue> = {};
  for (const { definition, value } of providedAdvanced) {
    const previous = definition.read(project);
    const changed = definition.changed
      ? definition.changed(project, value)
      : !advancedValuesEqual(previous, value);
    advancedSettings[definition.key] = value;
    advancedRows.push({
      label: definition.label,
      previous: definition.display(previous),
      next: definition.display(value),
      changed,
    });
    if (changed) {
      changedSettings.push(definition.key);
      definition.apply(body, value, project);
    }
  }

  let updatedProject = project;
  if (changedSettings.length > 0) {
    try {
      updatedProject = await client.fetch<Project>(
        `/v9/projects/${encodeURIComponent(project.id)}`,
        {
          method: 'PATCH',
          body: body as JSONObject,
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
    advancedRows,
    advancedSettings,
    asJson: formatResult.jsonOutput,
    client,
  });
  return 0;
}
