import { TelemetryClient } from '../..';

export class FlagsInspectTelemetryClient extends TelemetryClient {
  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }

  trackCliArgumentFlag(flag: string | undefined) {
    if (flag) {
      this.trackCliArgument({
        arg: 'flag',
        value: this.redactedValue,
      });
    }
  }
}
