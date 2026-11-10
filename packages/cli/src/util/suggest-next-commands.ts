import output from '../output-manager';
import chalk from 'chalk';

export interface SuggestedNextCommand {
  command: string;
  description: string;
}

export function suggestNextCommands(commands: SuggestedNextCommand[]) {
  output.print(
    chalk.dim(
      [
        `Next steps:`,
        ...commands.flatMap(({ command, description }) => [
          `- ${description}:`,
          `  ${command}`,
        ]),
      ].join('\n')
    )
  );
  output.print('\n');
}
