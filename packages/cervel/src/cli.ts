import { parseArgs as parseNodeArgs } from 'node:util';
import { build, serve, srvxOptions } from './index.js';

export const main = async () => {
  const args = process.argv.slice(2);
  const options = parseArgs(args);
  const { cwd, out, ...rest } = options.values;
  const [command, entrypoint] = options.positionals;

  const workPath = cwd;
  const repoRootPath = cwd;

  if (command === 'build') {
    const { tsPromise } = await build({
      workPath,
      repoRootPath,
      out,
      entrypoint,
    });
    await tsPromise;
  } else {
    await serve({ workPath, rest });
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
      out: {
        type: 'string',
        default: 'dist',
      },
      ...srvxOptions,
    },
  } as const);

  return {
    values: values as { cwd: string; out: string } & Record<
      string,
      string | boolean | undefined
    >,
    positionals,
  };
}
