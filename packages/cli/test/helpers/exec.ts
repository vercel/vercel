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
  opts: execa.Options<string> & { token?: string | boolean } = {}
): execa.ExecaChildProcess<string> {
  // eslint-disable-next-line no-console
  console.log(`$ vercel ${args.join(' ')}`);

  if (!args.includes('--token') && opts.token !== false) {
    args.push(
      '--token',
      typeof opts.token === 'string' ? opts.token : process.env.VERCEL_TOKEN!
    );
  }

  if (!args.includes('--scope')) {
    args.push('--scope', process.env.VERCEL_TEAM_ID!);
  }

  const combinedOptions: execa.Options<string> = {
    ...defaultOptions,
    ...opts,
  };
  // @ts-ignore - allow overwriting readonly property "env"
  combinedOptions.env = combinedOptions.env ?? {};

  // Force color to be off. We can test color in unit tests.
  // Explicitly set FORCE_COLOR=0 to override CI's FORCE_COLOR=1,
  // which takes precedence over NO_COLOR in chalk.
  combinedOptions.env['NO_COLOR'] = '1';
  combinedOptions.env['FORCE_COLOR'] = '0';

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
