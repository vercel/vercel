import { packageName } from '../../util/pkg-name';
import { yesOption } from '../../util/arg-common';

export const removeCommand = {
  name: 'remove',
  aliases: ['rm'],
  description: 'Delete deployment(s) by project name or deployment ID.',
  arguments: [
    {
      name: 'name|deploymentId',
      required: true,
      multiple: true,
    },
  ],
  options: [
    {
      ...yesOption,
      description: 'Skip confirmation',
    },
    {
      name: 'safe',
      shorthand: null,
      deprecatedShorthand: 's',
      type: Boolean,
      deprecated: false,
      description: 'Skip deployments with an active alias',
    },
    { name: 'hard', shorthand: null, type: Boolean, deprecated: false },
  ],
  examples: [
    {
      name: 'Delete a deployment identified by Deployment ID',
      value: `${packageName} remove dpl_abcdef123456890`,
    },
    {
      name: 'Delete all deployments with Project name `my-app`',
      value: `${packageName} remove my-app`,
    },
    {
      name: 'Delete two deployments with Deployment IDs',
      value: `${packageName} remove dpl_eyWt6zuSdeus dpl_uWHoA9RQ1d1o`,
    },
  ],
} as const;
