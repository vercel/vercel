import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { openSubcommand } from '../../../../commands/integration/command';

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

  trackCliArgumentResource(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'resource',
        value: this.redactedValue,
      });
    }
  }
}
