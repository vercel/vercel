import { TelemetryClient } from '../..';

export class IntegrationListTelemetryClient extends TelemetryClient {
  trackCliArgumentProject(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'project',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionIntegration(v: string | undefined, known: boolean | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'integration',
        value: known ? v : this.redactedValue,
      });
    }
  }

  trackCliFlagAll(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('all');
    }
  }
}
