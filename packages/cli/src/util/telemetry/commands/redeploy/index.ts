import { TelemetryClient } from '../..';

export class RedeployTelemetryClient extends TelemetryClient {
  trackCliArgumentDeploymentIdOrName(idOrName: string | undefined) {
    if (idOrName) {
      this.trackCliArgument({
        arg: 'idOrName',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagNoWait(noWait: boolean | undefined) {
    if (noWait) {
      this.trackCliFlag('no-wait');
    }
  }
}
