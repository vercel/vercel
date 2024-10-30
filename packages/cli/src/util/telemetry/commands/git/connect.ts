import { TelemetryClient } from '../..';

export class GitConnectTelemetryClient extends TelemetryClient {
  trackCliArgumentGitUrl(name: string | undefined) {
    if (name) {
      this.trackCliArgument({
        arg: 'gitUrl',
        value: this.redactedValue,
      });
    }
  }
}
