import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { experimentCommand } from '../../../../commands/experiment/command';

export class ExperimentTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof experimentCommand>
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

  trackCliSubcommandStart(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'start',
      value: actual,
    });
  }

  trackCliSubcommandStop(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'stop',
      value: actual,
    });
  }

  trackCliSubcommandAnalyse(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'analyse',
      value: actual,
    });
  }

  trackCliSubcommandMetrics(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'metrics',
      value: actual,
    });
  }
}
