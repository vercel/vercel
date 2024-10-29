import { TelemetryClient } from '../..';

export class GitConnectTelemetryClient extends TelemetryClient {
  trackCliArgumentGitUrl(name?: string) {
    if (name) {
      this.trackCliArgument({
        arg: 'gitUrl',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagYes(yes?: boolean) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
