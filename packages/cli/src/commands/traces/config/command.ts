import { packageName } from '../../../util/pkg-name';
import {
  environmentOption,
  formatOption,
  jsonOption,
  projectOption,
} from '../../../util/arg-common';

/**
 * The environment words the command line accepts. `preview` and `production`
 * map to the API `env` field; `any` maps to a rule with no `env` at all and
 * exists only in the CLI vocabulary.
 */
export const RULE_ENVIRONMENTS = ['any', 'preview', 'production'] as const;

const ruleEnvironmentOption = {
  ...environmentOption,
  description:
    'Environment the rule applies to (required): production, preview, or any',
} as const;

export const lsSubcommand = {
  name: 'ls',
  aliases: ['list'],
  description: 'List the Vercel tracing sampling rules for a project',
  arguments: [],
  options: [formatOption, jsonOption, projectOption],
  examples: [
    {
      name: 'List the sampling rules for the linked project',
      value: `${packageName} traces config ls`,
    },
    {
      name: 'List the sampling rules as JSON',
      value: `${packageName} traces config ls --json`,
    },
  ],
} as const;

export const setSubcommand = {
  name: 'set',
  aliases: [],
  description:
    'Enable Vercel tracing and add or replace one sampling rule. The rate is a whole percentage from 1 to 100.',
  arguments: [
    { name: 'rate', required: true },
    { name: 'requestPath', required: false },
  ],
  options: [ruleEnvironmentOption, formatOption, jsonOption, projectOption],
  examples: [
    {
      name: 'Trace a quarter of production traffic',
      value: `${packageName} traces config set 25 --environment production`,
    },
    {
      name: 'Trace every preview request to one path prefix',
      value: `${packageName} traces config set 100 /api --environment preview`,
    },
    {
      name: 'Trace one percent of traffic in every environment',
      value: `${packageName} traces config set 1 --environment any`,
    },
  ],
} as const;

export const rmSubcommand = {
  descriptionTone: 'normal',
  name: 'remove',
  aliases: ['rm', 'delete'],
  description:
    'Remove Vercel tracing sampling rules. Without a path prefix, every rule for the environment is removed. Removing the final rule disables tracing.',
  arguments: [{ name: 'requestPath', required: false }],
  options: [
    ruleEnvironmentOption,
    {
      name: 'default',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Remove only the rule that has no path prefix, keeping the per-path rules',
    },
    formatOption,
    jsonOption,
    projectOption,
  ],
  examples: [
    {
      name: 'Remove one rule by environment and path prefix',
      value: `${packageName} traces config remove /api --environment production`,
    },
    {
      name: 'Remove every rule for production',
      value: `${packageName} traces config remove --environment production`,
    },
    {
      name: 'Remove only the production rule that covers all paths',
      value: `${packageName} traces config remove --environment production --default`,
    },
  ],
} as const;

export const tracesConfigCommand = {
  name: 'config',
  aliases: [],
  description: 'Manage Vercel tracing sampling rules for a project.',
  arguments: [],
  subcommands: [lsSubcommand, setSubcommand, rmSubcommand],
  options: [],
  examples: [
    {
      name: 'List the sampling rules for the linked project',
      value: `${packageName} traces config ls`,
    },
    {
      name: 'Trace a quarter of production traffic',
      value: `${packageName} traces config set 25 --environment production`,
    },
    {
      name: 'Remove every rule for production',
      value: `${packageName} traces config remove --environment production`,
    },
  ],
} as const;
