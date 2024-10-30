import { TelemetryClient } from '../..';

export class IntegrationRemoveTelemetryClient extends TelemetryClient {
  trackCliArgumentIntegration(v?: string, known?: boolean) {
    if (v) {
      this.trackCliArgument({
        arg: 'integration',
        value: known ? v : this.redactedValue,
      });
    }
  }

  trackCliFlagYes(v?: boolean) {
    if (v) {
      this.trackCliFlag('yes');
    }
  }
}
