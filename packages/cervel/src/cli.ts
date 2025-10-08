import { parseArgs as parseNodeArgs } from 'node:util';
import { serve } from './index';

const args = process.argv.slice(2);
const options = parseArgs(args);

export const main = async () => {
  const [command, ...rest] = options.positionals;
  if (command === 'build') {
    console.log('running build');
  }
  await serve({ cwd: process.cwd(), srvxArgs: rest });
};

function parseArgs(args: string[]) {
  const { values, positionals } = parseNodeArgs({
    args,
    allowPositionals: true,
  });

  return {
    values,
    positionals,
  };
}
