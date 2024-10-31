import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { integrationCommand } from '../../../../commands/integration/command';

export class IntegrationTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof integrationCommand>
{
  trackCliSubcommandAdd(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'add',
      value: actual,
    });
  }

  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }

  trackCliSubcommandOpen(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'open',
      value: actual,
    });
  }

  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'remove',
      value: actual,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  trackCliArgumentCommand(value: string | undefined) {
    // no-op?
  }
}
