import { TelemetryClient } from '../..';

export class IntegrationListTelemetryClient extends TelemetryClient {
  trackCliArgumentProject(v?: string) {
    if (v) {
      this.trackCliArgument({
        arg: 'project',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionIntegration(v?: string, known?: boolean) {
    if (v) {
      this.trackCliOption({
        option: 'integration',
        value: known ? v : this.redactedValue,
      });
    }
  }

  trackCliFlagAll(v?: boolean) {
    if (v) {
      this.trackCliFlag('all');
    }
  }
}
