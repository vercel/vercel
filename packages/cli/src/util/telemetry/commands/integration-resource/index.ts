import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { integrationResourceCommand } from '../../../../commands/integration-resource/command';

export class IntegrationResourceTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof integrationResourceCommand>
{
  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'remove',
      value: actual,
    });
  }

  trackCliSubcommandDisconnect(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'disconnect',
      value: actual,
    });
  }
}
