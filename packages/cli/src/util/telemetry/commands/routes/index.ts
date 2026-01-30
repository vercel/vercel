import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { routesCommand } from '../../../../commands/routes/command';

export class RoutesTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof routesCommand>
{
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }

  trackCliSubcommandListVersions(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list-versions',
      value: actual,
    });
  }

  trackCliSubcommandInspect(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'inspect',
      value: actual,
    });
  }
}
