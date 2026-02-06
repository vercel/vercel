import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { listSubcommand } from '../../../../commands/link/command';

export class LinkLsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof listSubcommand>
{
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }

  trackCliFlagFormat(format: string | undefined) {
    this.trackCliOptionFormat(format);
  }
}
