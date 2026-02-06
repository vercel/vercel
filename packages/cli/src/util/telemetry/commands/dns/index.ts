import type { dnsCommand } from '../../../../commands/dns/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

export class DnsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof dnsCommand>
{
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

  trackCliSubcommandImport(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'import',
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
