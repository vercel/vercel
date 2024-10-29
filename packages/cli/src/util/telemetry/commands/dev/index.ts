import { TelemetryClient } from '../..';

export class DevTelemetryClient extends TelemetryClient {
  trackCliArgumentDir(dir: string | undefined) {
    if (dir) {
      this.trackCliArgument({
        arg: 'dir',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionListen(uri: string | undefined) {
    if (uri) {
      this.trackCliOption({
        option: 'listen',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionPort(port: string | undefined) {
    if (port) {
      this.trackCliOption({
        option: 'port',
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

  trackCliFlagHelp(help: boolean | undefined) {
    if (help) {
      this.trackCliFlag('help');
    }
  }
}
