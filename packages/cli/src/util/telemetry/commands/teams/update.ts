import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { updateSubcommand } from '../../../../commands/teams/command';

export class TeamsUpdateTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof updateSubcommand>
{
  trackCliArgumentTeamSlug(slug: string | undefined) {
    if (slug) {
      this.trackCliArgument({
        arg: 'team-slug',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionName(name: string | undefined) {
    if (name !== undefined) {
      this.trackCliOption({
        option: 'name',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionSlug(slug: string | undefined) {
    if (slug !== undefined) {
      this.trackCliOption({
        option: 'slug',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
