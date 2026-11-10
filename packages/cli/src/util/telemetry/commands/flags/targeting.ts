import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { targetingSubcommand } from '../../../../commands/flags/command';

export class FlagsTargetingTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof targetingSubcommand>
{
  trackCliSubcommandEnable(actual: string) {
    this.trackCliSubcommand({ subcommand: 'enable', value: actual });
  }
}
