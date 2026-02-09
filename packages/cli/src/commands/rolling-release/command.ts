import { yesOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const configureSubcommand = {
  name: 'configure',
  description: 'Configure rolling release settings for a project',
  aliases: [],
  arguments: [],
  examples: [
    {
      name: 'Enable automatic rolling release: 10% for 5 minutes, then 50% for 10 minutes, then 100%',
      value: `${packageName} rolling-release configure --enable --advancement-type=automatic --stage=10,5m --stage=50,10m`,
    },
    {
      name: 'Enable manual-approval rolling release: 10%, then 50%, then 100% (each stage requires approval)',
      value: `${packageName} rolling-release configure --enable --advancement-type=manual-approval --stage=10 --stage=50`,
    },
    {
      name: 'Disable rolling releases',
      value: `${packageName} rolling-release configure --disable`,
    },
    {
      name: 'Configure with raw JSON (advanced)',
      value: `${packageName} rolling-release configure --cfg='{"enabled":true, "advancementType":"automatic", "stages":[{"targetPercentage":10,"duration":5},{"targetPercentage":100}]}'`,
    },
  ],
  options: [
    {
      name: 'cfg',
      shorthand: null,
      deprecated: false,
      type: String,
      description: 'Raw JSON configuration (advanced). Overrides other flags.',
    },
    {
      name: 'enable',
      shorthand: null,
      deprecated: false,
      type: Boolean,
      description: 'Enable rolling releases for this project',
    },
    {
      name: 'disable',
      shorthand: null,
      deprecated: false,
      type: Boolean,
      description: 'Disable rolling releases for this project',
    },
    {
      name: 'advancement-type',
      shorthand: null,
      deprecated: false,
      type: String,
      argument: 'TYPE',
      description: 'How stages advance: "automatic" or "manual-approval"',
    },
    {
      name: 'stage',
      shorthand: null,
      deprecated: false,
      type: [String],
      argument: 'PERCENTAGE[,DURATION]',
      description:
        'Add a rollout stage. Percentage (1-99) with optional duration for automatic advancement (e.g. "10,5m"). Can be specified multiple times. A final 100% stage is added automatically.',
    },
  ],
} as const;

export const startSubcommand = {
  name: 'start',
  description: 'Start a rolling release',
  aliases: [],
  arguments: [],
  examples: [
    {
      name: 'Start a rolling release',
      value: `${packageName} rr start --dpl=dpl_123`,
    },
    {
      name: 'Start a rolling release using URL',
      value: `${packageName} rr start --dpl=https://example.vercel.app`,
    },
  ],
  options: [
    {
      name: 'dpl',
      shorthand: null,
      deprecated: false,
      type: String,
      description: 'The deploymentId or URL to target for the rolling release',
      required: true,
    },
    yesOption,
  ],
} as const;

export const approveSubcommand = {
  name: 'approve',
  description: 'Approve the current stage of an active rolling release',
  aliases: [],
  arguments: [],
  examples: [
    {
      name: 'Approve the current stage of an active rolling release',
      value: `${packageName} rolling-release approve --currentStageIndex=0 --dpl=dpl_123`,
    },
  ],
  options: [
    {
      name: 'dpl',
      shorthand: null,
      deprecated: false,
      type: String,
      description: 'The deploymentId of the rolling release',
    },
    {
      name: 'currentStageIndex',
      shorthand: null,
      deprecated: false,
      type: String,
      description: 'The current stage of a rolling release to approve',
    },
  ],
} as const;

export const abortSubcommand = {
  name: 'abort',
  description: 'Abort an active rolling release',
  aliases: [],
  arguments: [],
  examples: [
    {
      name: 'Abort an active rolling release',
      value: `${packageName} rolling-release abort --dpl=dpl_123`,
    },
  ],
  options: [
    {
      name: 'dpl',
      shorthand: null,
      deprecated: false,
      type: String,
      description: 'The deploymentId of the rolling release to abort',
    },
  ],
} as const;

export const completeSubcommand = {
  name: 'complete',
  description: 'Complete an active rolling release',
  aliases: [],
  arguments: [],
  examples: [
    {
      name: 'Complete an active rolling release',
      value: `${packageName} rolling-release complete --dpl=dpl_123`,
    },
  ],
  options: [
    {
      name: 'dpl',
      shorthand: null,
      deprecated: false,
      type: String,
      description: 'The deploymentId of the rolling release to complete',
    },
  ],
} as const;

export const fetchSubcommand = {
  name: 'fetch',
  description: 'Fetch details about a rolling release',
  aliases: [],
  arguments: [],
  examples: [
    {
      name: 'Fetch details about a rolling release',
      value: `${packageName} rolling-release fetch`,
    },
  ],
  options: [],
} as const;

export const rollingReleaseCommand = {
  name: 'rolling-release',
  aliases: ['rr'],
  description:
    'Rolling releases gradually shift traffic to a new deployment in stages, allowing you to monitor for errors before serving all traffic. Learn more: https://vercel.com/docs/rolling-releases',
  arguments: [],
  subcommands: [
    configureSubcommand,
    startSubcommand,
    approveSubcommand,
    abortSubcommand,
    completeSubcommand,
    fetchSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'Enable automatic rolling release with two stages',
      value: `${packageName} rr configure --enable --advancement-type=automatic --stage=10,5m --stage=50,10m`,
    },
    {
      name: 'Enable manual-approval rolling release',
      value: `${packageName} rr configure --enable --advancement-type=manual-approval --stage=10 --stage=50`,
    },
    {
      name: 'Disable rolling releases',
      value: `${packageName} rr configure --disable`,
    },
    {
      name: 'Start a rolling release',
      value: `${packageName} rr start --dpl=dpl_123`,
    },
    {
      name: 'Approve an active rolling release stage',
      value: `${packageName} rr approve --currentStageIndex=0 --dpl=dpl_123`,
    },
    {
      name: 'Abort an active rolling release',
      value: `${packageName} rr abort --dpl=dpl_123`,
    },
    {
      name: 'Complete an active rolling release',
      value: `${packageName} rr complete --dpl=dpl_123`,
    },
  ],
} as const;
