import { TelemetryClient } from '../..';

export class ProjectRmTelemetryClient extends TelemetryClient {
  trackCliArgumentName(name: string | undefined) {
    if (name) {
      this.trackCliArgument({
        arg: 'name',
        value: this.redactedValue,
      });
    }
  }
}
