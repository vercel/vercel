import { getFlagsSpecification } from './get-flags-specification';

export const globalCommandOptions = [
  {
    name: 'help',
    shorthand: 'h',
    type: Boolean,
    description: 'Output usage information',
    deprecated: false,
  },
  {
    name: 'version',
    shorthand: 'v',
    type: Boolean,
    description: 'Output the version number',
    deprecated: false,
  },
  {
    name: 'cwd',
    shorthand: null,
    type: String,
    argument: 'DIR',
    description:
      'Sets the current working directory for a single run of a command',
    deprecated: false,
  },
  {
    name: 'local-config',
    shorthand: 'A',
    type: String,
    argument: 'FILE',
    description: 'Path to the local `vercel.json` file',
    deprecated: false,
  },
  {
    name: 'global-config',
    shorthand: 'Q',
    type: String,
    argument: 'DIR',
    description: 'Path to the global `.vercel` directory',
    deprecated: false,
  },
  {
    name: 'debug',
    shorthand: 'd',
    type: Boolean,
    description: 'Debug mode (default off)',
    deprecated: false,
  },
  {
    name: 'no-color',
    shorthand: null,
    type: Boolean,
    description: 'No color mode (default off)',
    deprecated: false,
  },
  {
    name: 'scope',
    shorthand: 'S',
    type: String,
    description: 'Set a custom scope',
    deprecated: false,
  },
  {
    name: 'token',
    shorthand: 't',
    type: String,
    argument: 'TOKEN',
    description: 'Login token',
    deprecated: false,
  },
  { name: 'team', shorthand: 'T', type: String, deprecated: false },
  { name: 'api', shorthand: null, type: String, deprecated: false },
] as const;

const GLOBAL_OPTIONS = getFlagsSpecification(globalCommandOptions);

export default () => GLOBAL_OPTIONS;

export const yesOption = {
  name: 'yes',
  shorthand: 'y',
  type: Boolean,
  deprecated: false,
  description: 'Accept default value for all prompts',
} as const;

export const nextOption = {
  name: 'next',
  shorthand: 'N',
  type: Number,
  deprecated: false,
  description: 'Show next page of results',
  argument: 'MS',
} as const;

export const confirmOption = {
  name: 'confirm',
  shorthand: 'c',
  type: Boolean,
  deprecated: true,
} as const;

export const limitOption = {
  name: 'limit',
  shorthand: null,
  type: Number,
  deprecated: false,
  description: 'Number of results to return per page (default: 20, max: 100)',
  argument: 'NUMBER',
} as const;

export const forceOption = {
  name: 'force',
  shorthand: 'f',
  type: Boolean,
  deprecated: false,
} as const;
