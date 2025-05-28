export const rollingReleaseCommand = {
  name: 'rolling-release',
  aliases: ['rr'],
  description: "Manage your project's rolling release.",
  arguments: [],
  options: [
    {
      name: 'name',
      shorthand: 'n',
      type: String,
      deprecated: true,
      description: 'Provide a Vercel Project name',
    },
    {
      name: 'action',
      shorthand: null,
      type: String,
      deprecated: false,
      description: "Action to perfom on a project's rolling release.",
      enum: ['configure', 'start', 'approve', 'abort', 'complete', 'fetch'],
    },
    {
      name: 'cfg',
      shorthand: null,
      type: String,
      deprecated: false,
      description: "The project's rolling release configuration",
    },
    {
      name: 'deployId',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'The deploymentId to target during a promote/rollback.',
    },
    {
      name: 'currentStageIndex',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'The current stage of a rolling release to approve.',
    },
  ],
  examples: [
    {
      name: 'Configure a new rolling release with an intial stage of 10% that lasts for 5 minutes before automatically advancing to 100%',
      value:
        'vercel rolling-release --action=configure --cfg=\'{"enabled":true, "advancementType":"automatic", "stages":[{"targetPercentage":10,"duration":5},{"targetPercentage":100}]}\'',
    },
    {
      name: 'Configure a new rolling release with an intial stage of 10% that requires approval, prior to advancing to 100%',
      value:
        'vercel rolling-release --action=configure --cfg=\'{"enabled":true, "advancementType":"manual-approval","stages":[{"targetPercentage":10},{"targetPercentage":100}]}\'',
    },
    {
      name: 'Configure a new rolling release with an intial stage of 10% that requires approval, prior to advancing to 50%, and then again to 100%',
      value:
        'vercel rolling-release --action=configure --cfg=\'{"enabled":true, "advancementType":"manual-approval", "stages":[{"targetPercentage":10},{"targetPercentage":50},{"targetPercentage":100}]}\'',
    },
    {
      name: 'Disable rolling releases',
      value: "vercel rolling-release --action=configure --cfg='disable'",
    },
    {
      name: 'Start a rolling release',
      value: 'vercel rolling-release --action=start --deployId=dpl_123',
    },
    {
      name: 'Approve an active rolling release stage',
      value:
        'vercel rolling-release --action=approve --currentStageIndex=0 --deployId=dpl_123',
    },
    {
      name: 'Abort an active rolling release.',
      value: 'vercel rolling-release --action=abort  --deployId=dpl_123',
    },
    {
      name: 'Complete an active rolling release.',
      value: 'vercel rolling-release --action=complete  --deployId=dpl_123',
    },
  ],
} as const;
