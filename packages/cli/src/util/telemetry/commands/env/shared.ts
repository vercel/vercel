import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { sharedSubcommand } from '../../../../commands/env/command';

export class EnvSharedTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof sharedSubcommand>
{
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'ls',
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
