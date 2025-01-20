type CommandConfig = {
  [command: string]: string[];
};

interface SubcommandParsed {
  subcommand: string | string[];
  args: string[];
  subcommandOriginal: string;
}

export default function getSubcommand(
  cliArgs: string[],
  config: CommandConfig
): SubcommandParsed {
  const [subcommand, ...rest] = cliArgs;
  for (const k of Object.keys(config)) {
    if (k !== 'default' && config[k].indexOf(subcommand) !== -1) {
      return {
        subcommand: k,
        subcommandOriginal: subcommand,
        args: rest,
      };
    }
  }
  return {
    subcommand: config.default,
    subcommandOriginal: 'default',
    args: cliArgs,
  };
}
