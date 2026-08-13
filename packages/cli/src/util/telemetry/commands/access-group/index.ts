import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { accessGroupCommand } from '../../../../commands/access-group/command';

export class AccessGroupTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof accessGroupCommand>
{
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }

  trackCliSubcommandInspect(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'inspect',
      value: actual,
    });
  }

  trackCliArgumentIdOrName(idOrName: string | undefined) {
    if (idOrName) {
      this.trackCliArgument({
        arg: 'idOrName',
        value: this.redactedValue,
      });
    }
  }
}
