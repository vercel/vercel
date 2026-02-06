import type { openSubcommand } from '../../../../commands/integration/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

export class IntegrationOpenTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof openSubcommand>
{
  trackCliArgumentName(v: string | undefined, known?: boolean) {
    this.trackCliArgument({
      arg: 'name',
      value: known ? v : this.redactedValue,
    });
  }
}
