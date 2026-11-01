import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { migrateSkillsSubcommand } from '../../../../commands/integration/command';

export class IntegrationMigrateSkillsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof migrateSkillsSubcommand>
{
  trackCliFlagYes(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('yes');
    }
  }
}
