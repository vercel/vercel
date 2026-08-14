import { packageName } from '../../util/pkg-name';
import { yesOption } from '../../util/arg-common';

export const agentCommand = {
  name: 'agent',
  aliases: [],
  description:
    'Generate an AGENTS.md file with Vercel deployment best practices',
  arguments: [
    {
      name: 'init',
      required: false,
    },
  ],
  options: [
    {
      ...yesOption,
      description: 'Skip confirmation prompt',
    },
  ],
  examples: [
    {
      name: 'Generate AGENTS.md with Vercel best practices',
      value: `${packageName} agent init`,
    },
    {
      name: 'Skip confirmation prompt (useful for CI)',
      value: `${packageName} agent init --yes`,
    },
  ],
} as const;
