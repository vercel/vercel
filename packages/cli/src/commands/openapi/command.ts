import { packageName } from '../../util/pkg-name';
import { apiCommand } from '../api/command';

export const openapiCommand = {
  name: 'openapi',
  aliases: [],
  description:
    'Call the Vercel REST API using OpenAPI tag and operationId (same flags as `vercel api`). Only operations with `x-vercel-cli.supported: true` are listed or invokable. Use `x-vercel-cli.aliases` for short names (e.g. `list` for `getProjects`). Tag and operation names match case-insensitively and across camelCase, kebab-case, and snake_case.',
  arguments: [
    {
      name: 'tag',
      required: true,
    },
    {
      name: 'operationId',
      required: false,
    },
  ],
  options: [
    {
      name: 'describe',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Print kebab-case operation names and optional descriptions instead of calling the API. With only `<tag>`, lists every operation in that tag.',
    },
    ...apiCommand.options,
  ],
  examples: [
    {
      name: 'List all opted-in operations (by tag)',
      value: `${packageName} openapi ls`,
    },
    {
      name: 'Describe every operation under a tag',
      value: `${packageName} openapi user --describe`,
    },
    {
      name: 'Describe a single operation',
      value: `${packageName} openapi access-groups readAccessGroup --describe`,
    },
    {
      name: 'Invoke an operation (GET)',
      value: `${packageName} openapi user getAuthUser`,
    },
    {
      name: 'Invoke with body fields',
      value: `${packageName} openapi projects createProject -X POST -F name=my-app`,
    },
    {
      name: 'Generate curl (same as vercel api)',
      value: `${packageName} openapi teams getTeams --generate=curl`,
    },
  ],
} as const;
