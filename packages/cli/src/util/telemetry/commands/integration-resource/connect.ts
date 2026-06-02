import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { connectSubcommand } from '../../../../commands/integration-resource/command';

export class IntegrationResourceConnectTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof connectSubcommand>
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

  trackCliOptionEnvironment(v: string[] | undefined) {
    if (v?.length) {
      this.trackCliOption({
        option: 'environment',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionPrefix(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'prefix',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagYes(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('yes');
    }
  }
}
