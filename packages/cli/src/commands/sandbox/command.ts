import { packageName } from '../../util/pkg-name';
import { execSubcommand } from './exec/command';
import { createSubcommand } from './create/command';
import { connectSubcommand } from './connect/command';
import { shSubcommand } from './sh/command';

export const sandboxCommand = {
  name: 'sandbox',
  aliases: [],
  description: 'Interact with Vercel Sandbox',
  arguments: [],
  subcommands: [
    execSubcommand,
    createSubcommand,
    connectSubcommand,
    shSubcommand,
  ],
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
