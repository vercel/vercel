import type { certsCommand } from '../../../../commands/certs/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

export class CertsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof certsCommand>
{
  trackCliSubcommandIssue(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'issue',
      value: actual,
    });
  }

  trackCliSubcommandAdd(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'add',
      value: actual,
    });
  }

  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'remove',
      value: actual,
    });
  }

  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }
}
