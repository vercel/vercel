import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { inspectCommand } from '../../../../commands/inspect/command';

export class InspectTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof inspectCommand>
{
  trackCliArgumentUrlOrDeploymentId(idOrHost: string | undefined) {
    if (idOrHost) {
      this.trackCliArgument({
        arg: 'deploymentIdOrHost',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionTimeout(timeout: string | undefined) {
    if (timeout) {
      this.trackCliOption({
        option: 'timeout',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagLogs(logs: boolean | undefined) {
    if (logs) {
      this.trackCliFlag('logs');
    }
  }

  trackCliFlagWait(wait: boolean | undefined) {
    if (wait) {
      this.trackCliFlag('wait');
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
