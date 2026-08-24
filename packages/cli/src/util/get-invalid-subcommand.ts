import didYouMean from './did-you-mean';
import {
  consumePendingSubcommandNotFound,
  getTelemetryReporter,
} from './telemetry/reporter';

type CommandConfig = {
  [command: string]: string[];
};

export default function getInvalidSubcommand(config: CommandConfig) {
  const token = consumePendingSubcommandNotFound();
  const valid = Object.entries(config)
    .filter(([name]) => name !== 'default')
    .flatMap(([name, aliases]) => [name, ...aliases]);
  getTelemetryReporter()?.trackSubcommandNotFound(
    token,
    token ? didYouMean(token, valid, 0.7) : undefined
  );
  return `Please specify a valid subcommand: ${Object.keys(config).join(
    ' | '
  )}`;
}
