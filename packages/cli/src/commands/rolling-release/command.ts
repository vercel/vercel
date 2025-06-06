import { packageName } from '../../util/pkg-name';

export const rollingReleaseCommand = {
  name: 'rolling-release',
  aliases: ['rr', 'release'],
  description: "Manage your project's rolling release.",
  arguments: [],
  subcommands: [
    {
      name: 'configure',
      description: 'Configure rolling release settings for a project',
      aliases: [],
      arguments: [],
      examples: [
        {
          name: 'Configure a new rolling release with an intial stage of 10% that lasts for 5 minutes before automatically advancing to 100%',
          value: `${packageName} rolling-release configure --cfg='{"enabled":true, "advancementType":"automatic", "stages":[{"targetPercentage":10,"duration":5},{"targetPercentage":100}]}'`,
        },
      ],
      options: [
        {
          name: 'cfg',
          shorthand: null,
          deprecated: false,
          type: String,
          description: "The project's rolling release configuration",
        },
      ],
    },
    {
      name: 'start',
      description: 'Start a rolling release',
      aliases: [],
      arguments: [],
      examples: [
        {
          name: 'Start a rolling release',
          value: `${packageName} rolling-release start --deployId=dpl_123`,
        },
      ],
      options: [
        {
          name: 'deployId',
          shorthand: null,
          deprecated: false,
          type: String,
          description: 'The deploymentId to target for the rolling release',
        },
      ],
    },
    {
      name: 'approve',
      description: 'Approve the current stage of an active rolling release',
      aliases: [],
      arguments: [],
      examples: [
        {
          name: 'Approve the current stage of an active rolling release',
          value: `${packageName} rolling-release approve --currentStageIndex=0 --deployId=dpl_123`,
        },
      ],
      options: [
        {
          name: 'deployId',
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
    },
    {
      name: 'abort',
      description: 'Abort an active rolling release',
      aliases: [],
      arguments: [],
      examples: [
        {
          name: 'Abort an active rolling release',
          value: `${packageName} rolling-release abort --deployId=dpl_123`,
        },
      ],
      options: [
        {
          name: 'deployId',
          shorthand: null,
          deprecated: false,
          type: String,
          description: 'The deploymentId of the rolling release to abort',
        },
      ],
    },
    {
      name: 'complete',
      description: 'Complete an active rolling release',
      aliases: [],
      arguments: [],
      examples: [
        {
          name: 'Complete an active rolling release',
          value: `${packageName} rolling-release complete --deployId=dpl_123`,
        },
      ],
      options: [
        {
          name: 'deployId',
          shorthand: null,
          deprecated: false,
          type: String,
          description: 'The deploymentId of the rolling release to complete',
        },
      ],
    },
    {
      name: 'fetch',
      description: 'Fetch details about a rolling release',
      aliases: [],
      arguments: [],
      examples: [
        {
          name: 'Fetch details about a rolling release',
          value: `${packageName} rolling-release fetch --deployId=dpl_123`,
        },
      ],
      options: [
        {
          name: 'deployId',
          shorthand: null,
          deprecated: false,
          type: String,
          description: 'The deploymentId of the rolling release to fetch',
        },
      ],
    },
  ],
  options: [],
  examples: [
    {
      name: 'Configure a new rolling release with an intial stage of 10% that lasts for 5 minutes before automatically advancing to 100%',
      value: `${packageName} rolling-release configure --cfg='{"enabled":true, "advancementType":"automatic", "stages":[{"targetPercentage":10,"duration":5},{"targetPercentage":100}]}'`,
    },
    {
      name: 'Configure a new rolling release with an intial stage of 10% that requires approval, prior to advancing to 100%',
      value: `${packageName} rolling-release configure --cfg='{"enabled":true, "advancementType":"manual-approval","stages":[{"targetPercentage":10},{"targetPercentage":100}]}'`,
    },
    {
      name: 'Configure a new rolling release with an intial stage of 10% that requires approval, prior to advancing to 50%, and then again to 100%',
      value: `${packageName} rolling-release configure --cfg='{"enabled":true, "advancementType":"manual-approval", "stages":[{"targetPercentage":10},{"targetPercentage":50},{"targetPercentage":100}]}'`,
    },
    {
      name: 'Disable rolling releases',
      value: `${packageName} rolling-release configure --cfg='disable'`,
    },
    {
      name: 'Start a rolling release',
      value: `${packageName} rolling-release start --deployId=dpl_123`,
    },
    {
      name: 'Approve an active rolling release stage',
      value: `${packageName} rolling-release approve --currentStageIndex=0 --deployId=dpl_123`,
    },
    {
      name: 'Abort an active rolling release.',
      value: `${packageName} rolling-release abort --deployId=dpl_123`,
    },
    {
      name: 'Complete an active rolling release.',
      value: `${packageName} rolling-release complete --deployId=dpl_123`,
    },
  ],
} as const;
