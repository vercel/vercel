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

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }

  trackCliFlagConfirm(confirm: boolean | undefined) {
    if (confirm) {
      this.trackCliFlag('confirm');
    }
  }
}
