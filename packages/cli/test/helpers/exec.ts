import execa from 'execa';
import getGlobalDir from './get-global-dir';

const defaultOptions = {
  reject: false,
};

let globalArgs: string[] = [];

function getGlobalArgs() {
  if (process.env.CI) {
    return [];
  }

  if (globalArgs.length === 0) {
    globalArgs = ['-Q', getGlobalDir()];
    console.log(
      'No CI detected, adding defaultArgs to avoid polluting user settings',
      globalArgs
    );
  }

  return globalArgs;
}

/**
 * Execute Vercel CLI subcommands.
 */
export function execCli(
  file: string,
  args: string[] = [],
  options?: execa.Options<string>
): execa.ExecaChildProcess<string> {
  console.log(`$ vercel ${args.join(' ')}`);

  const globalArgs = getGlobalArgs();

  const combinedOptions: execa.Options<string> = {
    ...defaultOptions,
    ...options,
  };
  // @ts-ignore - allow overwriting readonly property "env"
  combinedOptions.env = combinedOptions.env ?? {};
  combinedOptions.env['NO_COLOR'] = combinedOptions.env['NO_COLOR'] ?? '1';

  return execa(file, [...args, ...globalArgs], combinedOptions);
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
