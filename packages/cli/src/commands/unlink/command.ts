import { packageName } from '../../util/pkg-name';
import { yesOption } from '../../util/arg-common';

export const unlinkCommand = {
  name: 'unlink',
  aliases: [],
  description: 'Unlink the current directory from a Vercel Project.',
  arguments: [],
  options: [
    {
      ...yesOption,
      description: 'Skip confirmation and remove .vercel directory',
    },
  ],
  examples: [
    {
      name: 'Unlink current directory from Vercel Project',
      value: `${packageName} unlink`,
    },
    {
      name: 'Unlink without confirmation prompts',
      value: `${packageName} unlink --yes`,
    },
    {
      name: 'Unlink a specific directory from Vercel Project',
      value: `${packageName} unlink --cwd /path/to/project`,
    },
  ],
} as const;
