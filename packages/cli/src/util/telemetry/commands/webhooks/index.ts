import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { webhooksCommand } from '../../../../commands/webhooks/command';

export class WebhooksTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof webhooksCommand>
{
  trackCliSubcommandCreate(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'create',
      value: actual,
    });
  }

  trackCliSubcommandInspect(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'inspect',
      value: actual,
    });
  }

  trackCliSubcommandDelete(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'delete',
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
