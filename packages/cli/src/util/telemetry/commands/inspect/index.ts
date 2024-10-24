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
    }
  }

  trackCliFlagLogs(logs?: boolean) {
    if (logs) {
    }
  }

  trackCliFlagWait(wait?: boolean) {
    if (wait) {
    }
  }
}
