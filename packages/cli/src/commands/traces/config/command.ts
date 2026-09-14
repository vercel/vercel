import { packageName } from '../../../util/pkg-name';
import {
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

export const lsSubcommand = {
  name: 'ls',
  aliases: ['list'],
  description: 'List the trace sampling rules for a project',
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
    'Add or replace one trace sampling rule. The rate is a whole percentage from 1 to 100.',
  arguments: [
    { name: 'environment', required: true },
    { name: 'rate', required: true },
    { name: 'requestPath', required: false },
  ],
  options: [formatOption, jsonOption, projectOption],
  examples: [
    {
      name: 'Trace a quarter of production traffic',
      value: `${packageName} traces config set production 25`,
    },
    {
      name: 'Trace every preview request to one path prefix',
      value: `${packageName} traces config set preview 100 /api`,
    },
    {
      name: 'Trace one percent of traffic in every environment',
      value: `${packageName} traces config set any 1`,
    },
  ],
} as const;

export const rmSubcommand = {
  name: 'rm',
  aliases: ['remove', 'delete'],
  description:
    'Remove trace sampling rules. Without a path prefix, every rule for the environment is removed.',
  arguments: [
    { name: 'environment', required: true },
    { name: 'requestPath', required: false },
  ],
  options: [
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
      value: `${packageName} traces config rm production /api`,
    },
    {
      name: 'Remove every rule for production',
      value: `${packageName} traces config rm production`,
    },
    {
      name: 'Remove only the production rule that covers all paths',
      value: `${packageName} traces config rm production --default`,
    },
  ],
} as const;

export const tracesConfigCommand = {
  name: 'config',
  aliases: [],
  description: 'Manage trace sampling rules for a Vercel project.',
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
      value: `${packageName} traces config set production 25`,
    },
    {
      name: 'Remove every rule for production',
      value: `${packageName} traces config rm production`,
    },
  ],
} as const;
