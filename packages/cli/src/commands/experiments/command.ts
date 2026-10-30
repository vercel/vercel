import {
  formatOption,
  projectOption,
  sinceOption,
  untilOption,
  yesOption,
} from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

const experimentArgument = { name: 'experiment', required: true } as const;
const fileOption = {
  name: 'file',
  shorthand: null,
  type: String,
  argument: 'FILE',
  description: 'Read the JSON request body from a file or - for stdin',
  deprecated: false,
} as const;
const rampOption = {
  name: 'ramp',
  shorthand: null,
  type: Number,
  argument: 'PERCENTAGE',
  description: 'Set the percentage of eligible units enrolled',
  deprecated: false,
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  hidden: true,
  description: 'List experiments for a project',
  arguments: [],
  options: [
    projectOption,
    {
      name: 'state',
      shorthand: null,
      type: String,
      argument: 'STATE',
      description: 'Filter by draft, running, or completed state',
      deprecated: false,
    },
    formatOption,
  ],
  examples: [
    { name: 'List experiments', value: `${packageName} experiments ls` },
    {
      name: 'List running experiments as JSON',
      value: `${packageName} experiments ls --state running --format json`,
    },
  ],
} as const;

export const inspectSubcommand = {
  name: 'inspect',
  aliases: [],
  hidden: true,
  description: 'Display experiment settings and lifecycle details',
  arguments: [experimentArgument],
  options: [projectOption, formatOption],
  examples: [
    {
      name: 'Inspect an experiment',
      value: `${packageName} experiments inspect checkout-copy`,
    },
  ],
} as const;

export const createSubcommand = {
  name: 'create',
  aliases: [],
  hidden: true,
  description: 'Create a draft experiment and its feature flag',
  arguments: [],
  options: [projectOption, fileOption, formatOption],
  examples: [
    {
      name: 'Create from a JSON file',
      value: `${packageName} experiments create --file experiment.json`,
    },
    {
      name: 'Create from stdin',
      value: `${packageName} experiments create --file -`,
    },
  ],
} as const;

export const updateSubcommand = {
  name: 'update',
  aliases: [],
  hidden: true,
  description: 'Update experiment settings from a JSON file',
  arguments: [experimentArgument],
  options: [
    projectOption,
    fileOption,
    {
      name: 'restart-analysis',
      shorthand: null,
      type: Boolean,
      description:
        'Start a new analysis epoch after updating a running experiment',
      deprecated: false,
    },
    {
      name: 'keep-analysis',
      shorthand: null,
      type: Boolean,
      description:
        'Keep the current analysis epoch after updating a running experiment',
      deprecated: false,
    },
    yesOption,
    formatOption,
  ],
  examples: [
    {
      name: 'Update a draft experiment',
      value: `${packageName} experiments update checkout-copy --file patch.json`,
    },
    {
      name: 'Update a running experiment without restarting analysis',
      value: `${packageName} experiments update checkout-copy --file patch.json --keep-analysis`,
    },
  ],
} as const;

export const startSubcommand = {
  name: 'start',
  aliases: [],
  hidden: true,
  description: 'Start a draft experiment at a ramp percentage',
  arguments: [experimentArgument],
  options: [projectOption, rampOption, yesOption, formatOption],
  examples: [
    {
      name: 'Start at 10%',
      value: `${packageName} experiments start checkout-copy --ramp 10`,
    },
  ],
} as const;

export const setRampSubcommand = {
  name: 'set-ramp',
  aliases: [],
  hidden: true,
  description: 'Change enrollment for a running experiment',
  arguments: [experimentArgument],
  options: [projectOption, rampOption, yesOption, formatOption],
  examples: [
    {
      name: 'Increase enrollment to 50%',
      value: `${packageName} experiments set-ramp checkout-copy --ramp 50`,
    },
  ],
} as const;

export const restartAnalysisSubcommand = {
  name: 'restart-analysis',
  aliases: [],
  hidden: true,
  description: 'Reset the measurement window while preserving enrollment',
  arguments: [experimentArgument],
  options: [projectOption, yesOption, formatOption],
  examples: [
    {
      name: 'Restart analysis',
      value: `${packageName} experiments restart-analysis checkout-copy`,
    },
  ],
} as const;

export const reseedEnrollmentSubcommand = {
  name: 'reseed-enrollment',
  aliases: [],
  hidden: true,
  description: 'Randomize experiment enrollment with a new seed',
  arguments: [experimentArgument],
  options: [projectOption, yesOption, formatOption],
  examples: [
    {
      name: 'Reseed enrollment',
      value: `${packageName} experiments reseed-enrollment checkout-copy`,
    },
  ],
} as const;

export const returnToDraftSubcommand = {
  name: 'return-to-draft',
  aliases: [],
  hidden: true,
  description: 'Return an experiment to draft state',
  arguments: [experimentArgument],
  options: [
    projectOption,
    {
      name: 'cause',
      shorthand: null,
      type: String,
      argument: 'CAUSE',
      description: 'Record manual, guardrail, or srm as the stop cause',
      deprecated: false,
    },
    {
      name: 'reason',
      shorthand: null,
      type: String,
      argument: 'TEXT',
      description: 'Record why the experiment returned to draft',
      deprecated: false,
    },
    yesOption,
    formatOption,
  ],
  examples: [
    {
      name: 'Return to draft after a guardrail alert',
      value: `${packageName} experiments return-to-draft checkout-copy --cause guardrail --reason "Error rate increased"`,
    },
  ],
} as const;

export const decideSubcommand = {
  name: 'decide',
  aliases: [],
  hidden: true,
  description: 'Complete an experiment with a winner or abandon it',
  arguments: [experimentArgument],
  options: [
    projectOption,
    {
      name: 'winner',
      shorthand: null,
      type: String,
      argument: 'VARIANT',
      description: 'Choose the winning variant ID',
      deprecated: false,
    },
    {
      name: 'abandon',
      shorthand: null,
      type: Boolean,
      description: 'Complete without a winning variant',
      deprecated: false,
    },
    {
      name: 'rationale',
      shorthand: null,
      type: String,
      argument: 'TEXT',
      description: 'Record the decision rationale',
      deprecated: false,
    },
    yesOption,
    formatOption,
  ],
  examples: [
    {
      name: 'Choose a winner',
      value: `${packageName} experiments decide checkout-copy --winner treatment --rationale "Higher conversion"`,
    },
    {
      name: 'Abandon an experiment',
      value: `${packageName} experiments decide checkout-copy --abandon --rationale "No meaningful lift"`,
    },
  ],
} as const;

export const analyzeSubcommand = {
  name: 'analyze',
  aliases: [],
  hidden: true,
  description: 'Analyze primary, secondary, and guardrail metrics',
  arguments: [experimentArgument],
  options: [
    projectOption,
    {
      name: 'exclude-contaminated',
      shorthand: null,
      type: Boolean,
      description: 'Exclude units with conflicting experiment assignments',
      deprecated: false,
    },
    {
      name: 'metric',
      shorthand: null,
      type: String,
      argument: 'ALIAS',
      description: 'Use a metric alias as the primary timeseries',
      deprecated: false,
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Analyze an experiment',
      value: `${packageName} experiments analyze checkout-copy`,
    },
    {
      name: 'Return complete results as JSON',
      value: `${packageName} experiments analyze checkout-copy --format json`,
    },
  ],
} as const;

export const diagnoseSubcommand = {
  name: 'diagnose',
  aliases: [],
  hidden: true,
  description: 'Show the latest exposures and metric events for an experiment',
  arguments: [experimentArgument],
  options: [
    projectOption,
    {
      name: 'limit',
      shorthand: 'n',
      deprecatedShorthand: 'l',
      type: Number,
      argument: 'COUNT',
      description: 'Set how many events to return, from 1 to 200',
      deprecated: false,
    },
    {
      name: 'exposures',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Show exposures; combine with --event to show both',
    },
    {
      name: 'event',
      shorthand: null,
      deprecatedShorthand: 'e',
      type: [String],
      argument: 'NAME',
      deprecated: false,
      description: 'Show this metric event; repeatable',
    },
    {
      name: 'unit',
      shorthand: null,
      type: String,
      argument: 'VALUE',
      deprecated: false,
      description: 'Show only rows for this experiment unit',
    },
    {
      ...sinceOption,
      description: `${sinceOption.description} (default: experiment launch)`,
    },
    {
      ...untilOption,
      description:
        'End time: ISO 8601 or relative; not with --follow (default: now)',
    },
    {
      name: 'follow',
      shorthand: 'f',
      type: Boolean,
      deprecated: false,
      description: 'Stream experiment events as they arrive; not with --until',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Show the latest experiment events',
      value: `${packageName} experiments diagnose checkout-copy`,
    },
    {
      name: 'Watch an experiment live',
      value: `${packageName} experiments diagnose checkout-copy --follow`,
    },
    {
      name: 'Show two metric events from the last hour',
      value: `${packageName} experiments diagnose checkout-copy --since 1h --event checkout --event purchase`,
    },
    {
      name: 'Follow one unit',
      value: `${packageName} experiments diagnose checkout-copy --unit visitor_abc123`,
    },
    {
      name: 'Return the latest 200 events as JSON',
      value: `${packageName} experiments diagnose checkout-copy --limit 200 --format json`,
    },
  ],
} as const;

export const openSubcommand = {
  name: 'open',
  aliases: [],
  hidden: true,
  description: 'Open an experiment in the Vercel dashboard',
  arguments: [{ name: 'experiment', required: false }],
  options: [
    projectOption,
    {
      name: 'tab',
      shorthand: null,
      type: String,
      argument: 'TAB',
      description: 'Open the configuration or analysis tab',
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Open experiment analysis',
      value: `${packageName} experiments open checkout-copy --tab analysis`,
    },
  ],
} as const;

export const deleteSubcommand = {
  name: 'delete',
  aliases: ['rm', 'del'],
  hidden: true,
  description: 'Delete an experiment and release its feature flag',
  arguments: [experimentArgument],
  options: [
    projectOption,
    {
      name: 'confirm',
      shorthand: null,
      type: String,
      argument: 'EXPERIMENT',
      description:
        'Prove the experiment ID or slug for non-interactive deletion',
      deprecated: false,
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Delete with non-interactive proof',
      value: `${packageName} experiments delete checkout-copy --confirm checkout-copy`,
    },
  ],
} as const;

export const experimentsCommand = {
  name: 'experiments',
  aliases: [],
  hidden: true,
  description: 'Manage and analyze feature flag experiments',
  arguments: [],
  subcommands: [
    listSubcommand,
    inspectSubcommand,
    createSubcommand,
    updateSubcommand,
    startSubcommand,
    setRampSubcommand,
    restartAnalysisSubcommand,
    reseedEnrollmentSubcommand,
    returnToDraftSubcommand,
    decideSubcommand,
    analyzeSubcommand,
    diagnoseSubcommand,
    openSubcommand,
    deleteSubcommand,
  ],
  options: [],
  examples: [],
} as const;
