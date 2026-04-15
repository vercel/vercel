import { packageName } from '../../util/pkg-name';
import { apiCommand } from '../api/command';

export const openapiCommand = {
  name: 'openapi',
  aliases: [],
  description:
    'Same behavior as `vercel api` when the first argument matches an opted-in OpenAPI tag (alias for tag-based usage). Prefer `vercel api <tag> [<operationId>]`. Only operations with `x-vercel-cli.supportedSubcommands: true` (or legacy `supported: true`) are listed or invokable. Use `x-vercel-cli.aliases` for short names (e.g. `list` for `getProjects`). Path parameters are positional values after `<operationId>` (in `{path}` order); query parameters use `--kebab-case` flags (see `x-vercel-cli.kind` on parameters: `argument` | `option`, with defaults by `in: path` / `in: query`). Tag and operation names match case-insensitively and across camelCase, kebab-case, and snake_case.',
  arguments: [
    {
      name: 'tag',
      required: false,
    },
    {
      name: 'operationId',
      required: false,
    },
  ],
  options: apiCommand.options,
  examples: [
    {
      name: 'List all opted-in operations (same as `vercel api`)',
      value: `${packageName} api`,
    },
    {
      name: 'Describe every operation under a tag',
      value: `${packageName} api user`,
    },
    {
      name: 'Describe a single operation',
      value: `${packageName} api access-groups readAccessGroup --describe`,
    },
    {
      name: 'Invoke an operation (GET)',
      value: `${packageName} api user getAuthUser`,
    },
    {
      name: 'Invoke with body fields',
      value: `${packageName} api projects createProject -X POST -F name=my-app`,
    },
    {
      name: 'Generate curl',
      value: `${packageName} api teams getTeams --generate=curl`,
    },
    {
      name: 'Path and query parameters (positional + flags)',
      value: `${packageName} api rolling-release delete-rolling-release-config my-project-id --team-id team_abc123`,
    },
  ],
} as const;
