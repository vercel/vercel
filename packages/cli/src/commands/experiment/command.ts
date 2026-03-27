import { packageName } from '../../util/pkg-name';

export const experimentCreateSubcommand = {
  name: 'create',
  aliases: [],
  description: 'Create an experiment (feature flag) from a JSON payload',
  arguments: [],
  options: [],
  examples: [
    {
      name: 'Create (coming soon)',
      value: `${packageName} experiment create`,
    },
  ],
} as const;

export const experimentListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List experiments for the current project',
  arguments: [],
  options: [],
  examples: [
    {
      name: 'List (coming soon)',
      value: `${packageName} experiment list`,
    },
  ],
} as const;

export const experimentStartSubcommand = {
  name: 'start',
  aliases: [],
  description: 'Set an experiment start time to now',
  arguments: [
    {
      name: 'slug',
      required: true,
    },
  ],
  options: [],
  examples: [
    {
      name: 'Start (coming soon)',
      value: `${packageName} experiment start my-experiment`,
    },
  ],
} as const;

export const experimentStopSubcommand = {
  name: 'stop',
  aliases: [],
  description: 'Set an experiment stop time to now',
  arguments: [
    {
      name: 'slug',
      required: true,
    },
  ],
  options: [],
  examples: [
    {
      name: 'Stop (coming soon)',
      value: `${packageName} experiment stop my-experiment`,
    },
  ],
} as const;

export const experimentAnalyseSubcommand = {
  name: 'analyse',
  aliases: ['analyze'],
  description: 'Fetch experiment results for a feature-flag experiment',
  arguments: [
    {
      name: 'slug',
      required: true,
    },
  ],
  options: [
    {
      name: 'peek',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Include partial results while the experiment is still running',
    },
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output structured JSON (machine-readable)',
    },
    {
      name: 'metric-event-name',
      shorthand: null,
      type: [String],
      deprecated: false,
      description:
        'Metric event name(s) to measure (repeatable). Required unless defaults are set.',
      argument: 'NAME',
    },
    {
      name: 'metric-type',
      shorthand: null,
      type: [String],
      deprecated: false,
      description: 'Metric type(s), e.g. conversion (repeatable)',
      argument: 'TYPE',
    },
    {
      name: 'unit-field',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Field used as the experimental unit (e.g. visitorId)',
      argument: 'FIELD',
    },
  ],
  examples: [
    {
      name: 'Results with default metric settings',
      value: `${packageName} experiment analyse my-flag --metric-event-name purchase --metric-type conversion --unit-field visitorId`,
    },
    {
      name: 'Peek at in-flight results',
      value: `${packageName} experiment analyse my-flag --peek --metric-event-name signup --metric-type conversion --unit-field visitorId`,
    },
    {
      name: 'JSON for scripts and agents',
      value: `${packageName} experiment analyse my-flag --json --metric-event-name purchase --metric-type conversion --unit-field visitorId`,
    },
  ],
} as const;

export const experimentCommand = {
  name: 'experiment',
  aliases: [],
  description: 'Manage feature-flag experiments and analyse results',
  hidden: true,
  arguments: [],
  subcommands: [
    experimentCreateSubcommand,
    experimentListSubcommand,
    experimentStartSubcommand,
    experimentStopSubcommand,
    experimentAnalyseSubcommand,
  ],
  options: [],
  examples: [],
} as const;
