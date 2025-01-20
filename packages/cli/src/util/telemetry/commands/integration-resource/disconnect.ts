import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { disconnectSubcommand } from '../../../../commands/integration-resource/command';

export class IntegrationResourceDisconnectTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof disconnectSubcommand>
{
  trackCliArgumentResource(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'resource',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentProject(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'project',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagAll(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('all');
    }
  }

  trackCliFlagYes(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('yes');
    }
  }
}
