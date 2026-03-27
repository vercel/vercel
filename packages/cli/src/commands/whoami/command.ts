import { packageName } from '../../util/pkg-name';
import { formatOption } from '../../util/arg-common';

export const whoamiCommand = {
  name: 'whoami',
  aliases: [],
  description:
    'Shows the username of the currently logged in user and the active Vercel scope from the current directory (`.vercel/project.json`, matching `repo.json` project, repo root, or CLI default). `--scope` / `--team` override linked scope for this invocation.',
  arguments: [],
  options: [formatOption],
  examples: [
    {
      name: 'Shows the username of the currently logged in user',
      value: `${packageName} whoami`,
    },
  ],
} as const;
