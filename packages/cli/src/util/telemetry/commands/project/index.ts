import type { projectCommand } from '../../../../commands/project/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

export class ProjectTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof projectCommand>
{
  trackCliSubcommandInspect(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'inspect',
      value: actual,
    });
  }

  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
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
}
