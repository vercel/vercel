import { packageName } from '../../util/pkg-name';

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
  options: [],
  examples: [
    {
      name: 'Generate AGENTS.md with Vercel best practices',
      value: `${packageName} agent init`,
    },
  ],
} as const;
