import type { switchSubcommand } from '../../../../commands/teams/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

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
