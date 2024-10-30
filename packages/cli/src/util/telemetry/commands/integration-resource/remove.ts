import { TelemetryClient } from '../..';

export class IntegrationResourceRemoveTelemetryClient extends TelemetryClient {
  trackCliArgumentResource(v?: string, known?: boolean) {
    if (v) {
      this.trackCliArgument({
        arg: 'resource',
        value: known ? v : this.redactedValue,
      });
    }
  }

  trackCliFlagDisconnectAll(v?: boolean) {
    if (v) {
      this.trackCliFlag('disconnect-all');
    }
  }

  trackCliFlagYes(v?: boolean) {
    if (v) {
      this.trackCliFlag('yes');
    }
  }
}
