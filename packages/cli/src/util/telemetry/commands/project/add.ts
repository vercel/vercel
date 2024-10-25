import { TelemetryClient } from '../..';

export class ProjectAddTelemetryClient extends TelemetryClient {
  trackCliArgumentName(name?: string) {
    if (name) {
      this.trackCliArgument({
        arg: 'name',
        value: this.redactedValue,
      });
    }
  }
}
