type CommandConfig = {
  [command: string]: string[];
};

export default function getInvalidSubcommand(config: CommandConfig) {
  return `Please specify a valid subcommand: ${Object.keys(config).join(
    ' | '
  )}`;
}
