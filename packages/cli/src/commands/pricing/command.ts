import { formatOption, jsonOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const pricingCommand = {
  name: 'pricing',
  aliases: [],
  summary: 'Compare public plan features',
  description:
    'Show Hobby, Pro, and Enterprise features from the public Vercel pricing table.',
  arguments: [
    {
      name: 'query',
      required: false,
      multiple: true,
    },
  ],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'List features grouped by the lowest plan that includes them',
      value: `${packageName} pricing`,
    },
    {
      name: 'Check whether a feature is available on a given plan',
      value: `${packageName} pricing "skew protection"`,
    },
    {
      name: 'Output machine-readable JSON for agents',
      value: `${packageName} pricing firewall --json`,
    },
  ],
} as const;
