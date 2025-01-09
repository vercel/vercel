import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { switchSubcommand } from '../../../../commands/teams/command';

export class TeamsSwitchTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof switchSubcommand>
{
  trackCliArgumentName(slug: string | undefined) {
    if (slug) {
      this.trackCliArgument({
        arg: 'slug',
        value: this.redactedValue,
      });
    }
  }
}
