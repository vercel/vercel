import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { listSubcommand } from '../../../../commands/integration/command';

export class IntegrationListTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof listSubcommand>
{
  trackCliArgumentProject(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'project',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionIntegration(v: string | undefined, known?: boolean) {
    if (v) {
      this.trackCliOption({
        option: 'integration',
        value: known ? v : this.redactedValue,
      });
    }
  }

  trackCliFlagAll(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('all');
    }
  }
}
