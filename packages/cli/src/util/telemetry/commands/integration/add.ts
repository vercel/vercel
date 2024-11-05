import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { addSubcommand } from '../../../../commands/integration/command';

export class IntegrationAddTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof addSubcommand>
{
  trackCliArgumentName(v: string | undefined, known?: boolean) {
    if (v) {
      this.trackCliArgument({
        arg: 'name',
        value: known ? v : this.redactedValue,
      });
    }
  }
}
