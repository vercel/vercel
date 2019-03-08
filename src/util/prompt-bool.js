//
import chalk from 'chalk';

async function promptBool(output, message) {
  return new Promise(resolve => {
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
