import execa from 'execa';

const defaultOptions = {
  reject: false,
};

/**
 * Execute Vercel CLI subcommands.
 */
export function execCli(
  file: string,
  args: string[] = [],
  options?: execa.Options<string>
): execa.ExecaChildProcess<string> {
  // eslint-disable-next-line no-console
  console.log(`$ vercel ${args.join(' ')}`);

  if (!args.includes('--scope')) {
    args.push('--scope', process.env.VERCEL_TEAM_ID!);
  }

  const combinedOptions: execa.Options<string> = {
    ...defaultOptions,
    ...options,
  };
  // @ts-ignore - allow overwriting readonly property "env"
  combinedOptions.env = combinedOptions.env ?? {};
  combinedOptions.env['NO_COLOR'] = combinedOptions.env['NO_COLOR'] ?? '1';

  return execa(file, args, combinedOptions);
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
