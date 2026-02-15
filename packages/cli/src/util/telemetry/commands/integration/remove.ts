import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { removeSubcommand } from '../../../../commands/integration/command';

export class IntegrationRemoveTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof removeSubcommand>
{
  trackCliArgumentName(v: string | undefined, known?: boolean) {
    if (v) {
      this.trackCliArgument({
        arg: 'name',
        value: known ? v : this.redactedValue,
      });
    }
  }

  trackCliFlagYes(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('yes');
    }
  }

  trackCliOptionResource(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'resource',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagDisconnectAll(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('disconnect-all');
    }
  }
}
