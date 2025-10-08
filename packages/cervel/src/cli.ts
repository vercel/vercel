import { parseArgs as parseNodeArgs } from 'node:util';
import { build, serve, srvxOptions } from './index.js';

const args = process.argv.slice(2);
const options = parseArgs(args);

export const main = async () => {
  const { cwd, ...rest } = options.values;
  const [command] = options.positionals;
  if (command === 'build') {
    const { tsPromise } = await build({ cwd });
    await tsPromise;
    return 0;
  } else {
    await serve({ cwd, rest });
  }
};

function parseArgs(args: string[]) {
  const { values, positionals } = parseNodeArgs({
    args,
    allowPositionals: true,
    options: {
      cwd: {
        type: 'string',
        default: process.cwd(),
      },
      ...srvxOptions,
    },
  });

  return {
    values,
    positionals,
  };
}
