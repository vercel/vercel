import { frameworkList, type Framework } from '@vercel/frameworks';
import type { Project } from '@vercel-internals/types';
import { formatSandboxRegionList } from '../../util/projects/sandbox-config';

const OTHER_FRAMEWORK_SLUG = 'other';
const MAX_SETTING_LENGTH = 256;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export const frameworkSlugs = frameworkList.map(
  framework => framework.slug ?? OTHER_FRAMEWORK_SLUG
);

export const buildSettingDefinitions = [
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

export type BuildSettingDefinition = (typeof buildSettingDefinitions)[number];
export type BuildSettingKey = BuildSettingDefinition['key'];
export type AutoDetectSetting = BuildSettingDefinition['autoDetect'];
export type SandboxSettingKey = 'sandboxRegion' | 'sandboxFailoverRegions';
export type ProjectSettingKey =
  | 'framework'
  | BuildSettingKey
  | SandboxSettingKey;
export type ProjectSettingValue = string | string[] | null;

export interface ProjectSettingsUpdate {
  framework?: string | null;
  buildCommand?: string | null;
  devCommand?: string | null;
  installCommand?: string | null;
  outputDirectory?: string | null;
  rootDirectory?: string | null;
  sandboxRegion?: string | null;
  sandboxFailoverRegions?: string[] | null;
}

export const settingOrder: readonly ProjectSettingKey[] = [
  'framework',
  ...buildSettingDefinitions.map(setting => setting.key),
  'sandboxRegion',
  'sandboxFailoverRegions',
];

export const autoDetectSettings = buildSettingDefinitions.map(
  setting => setting.autoDetect
);

export const settingLabels: Record<ProjectSettingKey, string> = {
  framework: 'Framework',
  ...(Object.fromEntries(
    buildSettingDefinitions.map(setting => [setting.key, setting.label])
  ) as Record<BuildSettingKey, string>),
  sandboxRegion: 'Sandbox Region',
  sandboxFailoverRegions: 'Failover',
};

export function isSandboxSettingKey(
  key: ProjectSettingKey
): key is SandboxSettingKey {
  return key === 'sandboxRegion' || key === 'sandboxFailoverRegions';
}

export function resolveFramework(input: string): Framework | undefined {
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

export function formatSettingValue(
  key: ProjectSettingKey,
  value: ProjectSettingValue
): string {
  if (key === 'sandboxRegion') {
    return typeof value === 'string' ? value : 'Auto';
  }
  if (key === 'sandboxFailoverRegions') {
    return formatSandboxRegionList(Array.isArray(value) ? value : []);
  }
  if (key === 'framework') {
    return formatFramework(typeof value === 'string' ? value : null);
  }
  if (value === null) {
    return 'Auto';
  }
  return value === '' ? '""' : String(value);
}

export function getCurrentSetting(
  project: Project,
  key: ProjectSettingKey
): ProjectSettingValue {
  if (key === 'sandboxRegion') {
    return project.sandbox?.region ?? null;
  }
  if (key === 'sandboxFailoverRegions') {
    return project.sandbox?.failoverRegions ?? null;
  }
  return project[key] ?? null;
}

export function isSameSettingValue(
  a: ProjectSettingValue,
  b: ProjectSettingValue
): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const left = Array.isArray(a) ? a : [];
    const right = Array.isArray(b) ? b : [];
    return (
      left.length === right.length &&
      left.every((value, index) => value === right[index])
    );
  }
  return a === b;
}

export function hasSetting(
  settings: ProjectSettingsUpdate,
  key: ProjectSettingKey
): boolean {
  return Object.prototype.hasOwnProperty.call(settings, key);
}

export function validateSettingValue(
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

export function parseAutoDetectSettings(inputs: string[]): string[] {
  return inputs.flatMap(input => input.split(',')).map(input => input.trim());
}

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
export type AdvancedValue = string | boolean;
export type PatchBody = Record<string, unknown>;
export type AdvancedParseResult =
  | { ok: true; value: AdvancedValue }
  | { ok: false; message: string };

export interface AdvancedProjectFields {
  resourceConfig?: {
    [key: string]: unknown;
    fluid?: boolean;
    functionDefaultMemoryType?: string;
    elasticConcurrencyEnabled?: boolean;
    buildMachineType?: string;
    buildMachineSelection?: string;
  } | null;
  sandbox?: { region?: string; failoverRegions?: string[] } | null;
}

export function getAdvancedFields(project: Project): AdvancedProjectFields {
  return project as Project & AdvancedProjectFields;
}

type AdvancedResourceConfigKey =
  | 'fluid'
  | 'functionDefaultMemoryType'
  | 'elasticConcurrencyEnabled'
  | 'buildMachineType';

export type AdvancedSettingDefinition = {
  key: string;
  flag: string;
  label: string;
  requiresPaidPlan?: (value: AdvancedValue) => boolean;
  hasCostImpact?: (value: AdvancedValue) => boolean;
} & ({ kind: 'toggle' } | { kind: 'enum'; values: readonly string[] }) &
  (
    | { target: 'resourceConfig'; field: AdvancedResourceConfigKey }
    | { target: 'project'; field: 'nodeVersion' }
  );

export interface ProvidedAdvancedSetting {
  definition: AdvancedSettingDefinition;
  value: AdvancedValue;
}

export interface AdvancedPreviewRow {
  key: string;
  label: string;
  previous: string;
  next: string;
  changed: boolean;
}

function parseOnOff(flag: string, raw: string): AdvancedParseResult {
  if (raw === 'on' || raw === 'off') {
    return { ok: true, value: raw === 'on' };
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
  return value === true ? 'on' : value === false ? 'off' : 'Auto';
}

function displayValue(value: AdvancedValue | null | undefined): string {
  return value === null || value === undefined ? 'Auto' : String(value);
}

export function parseAdvanced(
  definition: AdvancedSettingDefinition,
  raw: string
): AdvancedParseResult {
  return definition.kind === 'toggle'
    ? parseOnOff(definition.flag, raw)
    : parseEnumValue(definition.label, raw, definition.values);
}

export function readAdvanced(
  definition: AdvancedSettingDefinition,
  project: Project
): AdvancedValue | null | undefined {
  const fields = getAdvancedFields(project);
  switch (definition.target) {
    case 'resourceConfig':
      if (
        definition.field === 'buildMachineType' &&
        fields.resourceConfig?.buildMachineSelection === 'elastic'
      ) {
        return 'elastic';
      }
      return fields.resourceConfig?.[definition.field];
    case 'project':
      return project[definition.field];
  }
}

export function displayAdvanced(
  definition: AdvancedSettingDefinition,
  value: AdvancedValue | null | undefined
): string {
  return definition.kind === 'toggle'
    ? displayOnOff(value)
    : displayValue(value);
}

export const advancedSettingDefinitions: readonly AdvancedSettingDefinition[] =
  [
    {
      key: 'fluid',
      flag: '--fluid-compute',
      label: 'Fluid Compute',
      kind: 'toggle',
      target: 'resourceConfig',
      field: 'fluid',
    },
    {
      key: 'functionDefaultMemoryType',
      flag: '--function-cpu',
      label: 'Function CPU',
      kind: 'enum',
      values: FUNCTION_CPU_TIERS,
      target: 'resourceConfig',
      field: 'functionDefaultMemoryType',
      requiresPaidPlan: () => true,
      hasCostImpact: () => true,
    },
    {
      key: 'buildMachineType',
      flag: '--build-machine',
      label: 'Build Machine',
      kind: 'enum',
      values: BUILD_MACHINE_TYPES,
      target: 'resourceConfig',
      field: 'buildMachineType',
      requiresPaidPlan: () => true,
      hasCostImpact: () => true,
    },
    {
      key: 'elasticConcurrencyEnabled',
      flag: '--elastic-concurrency',
      label: 'Elastic Concurrency',
      kind: 'toggle',
      target: 'resourceConfig',
      field: 'elasticConcurrencyEnabled',
      requiresPaidPlan: value => value === true,
      hasCostImpact: value => value === true,
    },
    {
      key: 'nodeVersion',
      flag: '--node-version',
      label: 'Node.js Version',
      kind: 'enum',
      values: NODE_VERSIONS,
      target: 'project',
      field: 'nodeVersion',
    },
  ];
