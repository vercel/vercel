import { formatOption, yesOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const notebooksSubcommand = {
  name: 'notebooks',
  aliases: [],
  description: 'Manage observability notebooks',
  arguments: [
    { name: 'action', required: true },
    { name: 'id', required: false },
  ],
  options: [
    formatOption,
    yesOption,
    {
      name: 'name',
      shorthand: null,
      type: String,
      argument: 'NAME',
      deprecated: false,
      description: 'Notebook name for create/update commands',
    },
  ],
  examples: [
    {
      name: 'List notebooks',
      value: `${packageName} observability notebooks ls`,
    },
    {
      name: 'Inspect a notebook',
      value: `${packageName} observability notebooks inspect ntb_123`,
    },
    {
      name: 'Create a notebook',
      value: `${packageName} observability notebooks create --name "SLO Overview"`,
    },
    {
      name: 'Update a notebook name',
      value: `${packageName} observability notebooks update ntb_123 --name "Platform SLOs"`,
    },
    {
      name: 'Delete a notebook',
      value: `${packageName} observability notebooks rm ntb_123 --yes`,
    },
  ],
} as const;

export const observabilityCommand = {
  name: 'observability',
  aliases: [],
  description: 'Manage observability resources',
  arguments: [],
  subcommands: [notebooksSubcommand],
  options: [formatOption],
  examples: [
    {
      name: 'List notebooks',
      value: `${packageName} observability notebooks ls`,
    },
  ],
} as const;
