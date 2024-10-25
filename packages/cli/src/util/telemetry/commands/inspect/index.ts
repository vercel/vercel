import { TelemetryClient } from '../..';

export class InspectTelemetryClient extends TelemetryClient {
  trackCliArgumentDeploymentIdOrHost(idOrHost?: string) {
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
