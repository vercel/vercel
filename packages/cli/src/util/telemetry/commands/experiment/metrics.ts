import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { experimentMetricsSubcommand } from '../../../../commands/experiment/command';

export class ExperimentMetricsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof experimentMetricsSubcommand>
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
}
