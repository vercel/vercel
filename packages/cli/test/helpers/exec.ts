import execa from 'execa';
import getGlobalDir from './get-global-dir';

const defaultOptions = {
  reject: false,
};

function getGlobalArgs() {
  if (process.env.CI) {
    return [];
  }

  const globalArgs = ['-Q', getGlobalDir()];

  console.log(
    'No CI detected, adding defaultArgs to avoid polluting user settings',
    globalArgs
  );

  return globalArgs;
}

/**
 * Execute Vercel CLI subcommands.
 */
export function execCli(
  file: string,
  args: string[],
  options?: execa.Options<string>
): execa.ExecaChildProcess<string> {
  console.log(`$ vercel ${args.join(' ')}`);

  const globalArgs = getGlobalArgs();

  const proc = execa(file, [...args, ...globalArgs], {
    env: {
      NO_COLOR: '1',
    },
    ...defaultOptions,
    ...options,
  });

  return proc;
}

/**
 * Execute an abitrary command.
 */
export function exec(cwd: string, command: string, args: string[] = []) {
  return execa(command, args, {
    cwd,
    ...defaultOptions,
  });
}
