import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { inspectCommand } from '../../../../commands/inspect/command';

export class InspectTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof inspectCommand>
{
  trackCliArgumentUrlOrDeploymentId(idOrHost?: string) {
    if (idOrHost) {
      this.trackCliArgument({
        arg: 'deploymentIdOrHost',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionTimeout(timeout?: string) {
    if (timeout) {
      this.trackCliOption({
        option: 'timeout',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagLogs(logs?: boolean) {
    if (logs) {
      this.trackCliFlag('logs');
    }
  }

  trackCliFlagWait(wait?: boolean) {
    if (wait) {
      this.trackCliFlag('wait');
    }
  }
}
