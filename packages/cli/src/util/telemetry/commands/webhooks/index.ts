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

  trackCliSubcommandGet(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'get',
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
