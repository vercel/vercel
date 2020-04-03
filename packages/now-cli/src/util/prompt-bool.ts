import chalk from 'chalk';
import { Output } from './output';

async function promptBool(output: Output, message: string): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    output.print(`${chalk.gray('>')} ${message} ${chalk.gray('[y/N] ')}`);
    process.stdin
      .on('data', d => {
        process.stdin.pause();
        resolve(
          d
            .toString()
            .trim()
            .toLowerCase() === 'y'
        );
      })
      .resume();
  });
}

export default promptBool;
