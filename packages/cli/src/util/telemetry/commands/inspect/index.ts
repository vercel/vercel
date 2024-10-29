import { TelemetryClient } from '../..';

export class InspectTelemetryClient extends TelemetryClient {
  trackCliArgumentDeploymentIdOrHost(idOrHost: string | undefined) {
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
}
