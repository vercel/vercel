import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { deployHooksCommand } from '../../../../commands/deploy-hooks/command';

export class DeployHooksTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof deployHooksCommand>
{
  trackCliSubcommandCreate(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'create',
      value: actual,
    });
  }

  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }

  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'remove',
      value: actual,
    });
  }
}
