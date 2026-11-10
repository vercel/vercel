import type { RootHelpCommand } from './commands/root-help';
import { ROOT_HELP_GROUPS } from './commands/root-help';
import {
  buildCommandOptionLines,
  buildCommandExampleLines,
} from './commands/help';
import { globalCommandOptions } from './util/arg-common';
import {
  helpColumns,
  helpUsage,
  helpRows,
  helpSection,
  helpLiterals,
} from './util/output/help-format';
import { createHelpTheme } from './util/output/help-theme';

export const ROOT_HELP_EXAMPLES = [
  { name: 'Deploy the current directory', value: 'vercel' },
  {
    name: 'Deploy a linked project without prompts',
    value: 'vercel deploy --yes --non-interactive',
  },
  { name: 'Show help for a command', value: 'vercel domains --help' },
] as const;

export function help(
  commands: ReadonlyArray<RootHelpCommand>,
  columns = 80,
  theme = createHelpTheme()
): string {
  columns = helpColumns(columns);
  const sections = Object.keys(ROOT_HELP_GROUPS).flatMap(group => {
    const rows = commands.filter(command => command.group === group);
    return rows.length
      ? [
          helpSection(
            group,
            helpRows(
              rows.map(command => ({
                syntax: helpLiterals(command.names),
                description: `${command.description}${command.default ? ' (default)' : ''}`,
              })),
              columns,
              theme
            ),
            theme
          ),
        ]
      : [];
  });
  return (
    [
      `${helpUsage(theme)} ${theme.reference('vercel')} [options] [command | path]`,
      ...sections,
      buildCommandOptionLines(
        [
          ...globalCommandOptions,
          {
            name: 'changelog',
            shorthand: null,
            type: Boolean,
            deprecated: false,
            description: 'Show the 5 latest Vercel product updates',
          },
        ],
        { columns, theme },
        'Global Options'
      ),
      buildCommandExampleLines(
        { examples: ROOT_HELP_EXAMPLES },
        columns,
        theme
      ),
    ]
      .filter(Boolean)
      .join('\n\n') + '\n'
  );
}
