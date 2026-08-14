import { packageName } from '../../util/pkg-name';

export const sandboxCommand = {
  name: 'sandbox',
  aliases: [],
  description: 'Interact with Vercel Sandbox',
  arguments: [],
  options: [],
  examples: [
    {
      name: 'List sandboxes for the current project',
      value: `${packageName} sandbox list`,
    },
    {
      name: 'Create a sandbox and connect to it',
      value: `${packageName} sandbox create --connect`,
    },
  ],
} as const;
