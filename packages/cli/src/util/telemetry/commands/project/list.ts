import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { listSubcommand } from '../../../../commands/project/command';

export class ProjectListTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof listSubcommand>
{
  trackCliFlagUpdateRequired(updateRequired: boolean | undefined) {
    if (updateRequired) {
      this.trackCliFlag('update-required');
    }
  }

  trackCliOptionNext(next: number | undefined) {
    if (next) {
      this.trackCliOption({
        option: 'next',
        value: this.redactedValue,
      });
    }
  }
}
