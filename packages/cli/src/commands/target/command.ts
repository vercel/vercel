import {
  formatOption,
  jsonOption,
  projectOption,
  yesOption,
} from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List targets defined for the current Project',
  arguments: [],
  options: [
    formatOption,
    jsonOption,
    projectOption,
    {
      ...yesOption,
      description:
        'Skip confirmation when linking is required (e.g. in non-interactive mode)',
    },
  ],
  examples: [
    {
      name: 'List all targets for the current Project',
      value: `${packageName} target ls my-project`,
    },
  ],
} as const;

export const inspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description: 'Show a custom environment in full',
  arguments: [
    {
      name: 'name',
      required: true,
    },
  ],
  options: [
    formatOption,
    jsonOption,
    projectOption,
    {
      ...yesOption,
      description:
        'Skip confirmation when linking is required (e.g. in non-interactive mode)',
    },
  ],
  examples: [
    {
      name: 'Show a custom environment in full',
      value: `${packageName} target inspect my-environment`,
    },
    {
      name: 'Show a custom environment as JSON',
      value: `${packageName} target inspect my-environment --json`,
    },
  ],
} as const;

const descriptionOption = {
  name: 'description',
  shorthand: null,
  type: String,
  argument: 'TEXT',
  description: 'Description of the custom environment',
  deprecated: false,
} as const;

const branchMatcherTypeOption = {
  name: 'branch-matcher-type',
  shorthand: null,
  type: String,
  argument: 'TYPE',
  description:
    'Branch matcher type; one of "equals", "startsWith", or "endsWith"',
  deprecated: false,
} as const;

const branchMatcherPatternOption = {
  name: 'branch-matcher-pattern',
  shorthand: null,
  type: String,
  argument: 'PATTERN',
  description: 'Git branch name or portion thereof to match',
  deprecated: false,
} as const;

export const addSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Add a new custom environment to the current Project',
  arguments: [
    {
      name: 'name',
      required: true,
    },
  ],
  options: [
    descriptionOption,
    branchMatcherTypeOption,
    branchMatcherPatternOption,
    {
      name: 'copy-env-vars-from',
      shorthand: null,
      type: String,
      argument: 'ENV',
      description:
        'Custom environment to copy environment variables from (name or ID)',
      deprecated: false,
    },
    projectOption,
    {
      ...yesOption,
      description:
        'Skip confirmation when linking is required (e.g. in non-interactive mode)',
    },
  ],
  examples: [
    {
      name: 'Add a custom environment',
      value: `${packageName} target add staging`,
    },
    {
      name: 'Add a custom environment that tracks branches starting with "staging"',
      value: `${packageName} target add staging --branch-matcher-type startsWith --branch-matcher-pattern staging`,
    },
  ],
} as const;

export const targetCommand = {
  name: 'target',
  aliases: ['targets'],
  description: 'Manage your Vercel Project\'s "targets" (custom environments).',
  arguments: [],
  subcommands: [listSubcommand, inspectSubcommand, addSubcommand],
  options: [],
  examples: [],
} as const;
