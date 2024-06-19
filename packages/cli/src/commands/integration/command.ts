import { Command } from '../help';
import { packageName } from '../../util/pkg-name';

export const integrationCommand: Command = {
  name: 'integration',
  description: 'Interact with the Vercel Marketplace',
  arguments: [
    {
      name: 'name',
      required: true,
    },
  ],
  subcommands: [
    {
      name: 'add (default)',
      description:
        'Add a Vercel Marketplace integration to your project. This is the default subcommand and can be omitted. (`vc i integration add contentful` equals `vc i contentful`)',
      arguments: [
        {
          name: 'name',
          required: true,
        },
        {
          name: 'environment',
          required: false,
        },
      ],
      options: [
        {
          name: 'sensitive',
          description: 'Add a sensitive Environment Variable',
          shorthand: null,
          type: String,
          deprecated: false,
        },
        {
          name: 'force',
          description: 'Force overwrites when a command would normally fail',
          shorthand: null,
          type: Boolean,
          deprecated: false,
        },
      ],
      examples: [],
    },
  ],
  options: [],
  examples: [
    {
      name: 'Add a new Vercel Marketplace integration to your project',
      value: [`${packageName} i <name>`],
    },
  ],
};
