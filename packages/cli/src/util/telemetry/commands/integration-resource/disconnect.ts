import { TelemetryClient } from '../..';

export class IntegrationResourceDisconnectTelemetryClient extends TelemetryClient {
  trackCliArgumentResource(v?: string) {
    if (v) {
      this.trackCliArgument({
        arg: 'resource',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentProject(v?: string) {
    if (v) {
      this.trackCliArgument({
        arg: 'project',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagAll(v?: boolean) {
    if (v) {
      this.trackCliFlag('all');
    }
  }

  trackCliFlagYes(v?: boolean) {
    if (v) {
      this.trackCliFlag('yes');
    }
  }
}
