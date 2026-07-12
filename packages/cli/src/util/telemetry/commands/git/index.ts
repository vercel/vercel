import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { gitCommand } from '../../../../commands/git/command';

export class GitTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof gitCommand>
{
  trackCliSubcommandConnect(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'connect',
      value: actual,
    });
  }

  trackCliSubcommandDisconnect(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'disconnect',
      value: actual,
    });
  }

  // TelemetryMethods generates required keys based on arguments+options:
  // - git-args argument -> trackCliArgumentGitArgs
  // - --no-attach -> trackCliFlagNoAttach etc.
  // We also expose a passthrough helper not modeled in command.ts (dynamic).

  trackCliArgumentGitArgs(_value: string | undefined) {
    // Intentionally do not record raw git args (may contain sensitive info)
    // but satisfy type checker for TelemetryMethods.
    this.trackCliArgument({
      arg: 'git-args',
      value: this.redactedValue,
    } as any);
  }

  trackCliSubcommandPassthrough(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'passthrough',
      value: actual,
    });
  }

  trackCliFlagNoAttach(noAttach: boolean | undefined) {
    if (noAttach) {
      this.trackCliFlag('no-attach');
    }
  }

  trackCliFlagLogs(logs: boolean | undefined) {
    if (logs) {
      this.trackCliFlag('logs');
    }
  }

  trackCliFlagNoLogs(noLogs: boolean | undefined) {
    if (noLogs) {
      this.trackCliFlag('no-logs');
    }
  }
}
