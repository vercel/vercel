import chalk from 'chalk';
import output from '../output-manager';

export function suggestNextCommands(commands: string[]) {
  output.print(
    chalk.dim(
      [
        `Common next commands:`,
        ...commands.map(command => `- ${command}`),
      ].join('\n')
    )
  );
  output.print('\n');
}
