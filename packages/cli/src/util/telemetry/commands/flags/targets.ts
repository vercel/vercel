import { TelemetryClient } from '../..';
import { FlagsRulesCommandTelemetryClient } from './rules';

export class FlagsTargetsTelemetryClient extends TelemetryClient {
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({ subcommand: 'ls', value: actual });
  }

  trackCliSubcommandAdd(actual: string) {
    this.trackCliSubcommand({ subcommand: 'add', value: actual });
  }

  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({ subcommand: 'rm', value: actual });
  }
}

export class FlagsTargetsCommandTelemetryClient extends FlagsRulesCommandTelemetryClient {
  trackCliArgumentTarget(targets: string[] | undefined) {
    if (targets?.length) {
      this.trackCliArgument({
        arg: 'target',
        value: this.redactedValue,
      });
    }
  }
}
