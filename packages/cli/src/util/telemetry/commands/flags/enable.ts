import { TelemetryClient } from '../..';

export class FlagsEnableTelemetryClient extends TelemetryClient {
  trackCliArgumentFlag(flag: string | undefined) {
    if (flag) {
      this.trackCliArgument({
        arg: 'flag',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionEnvironment(environment: string | undefined) {
    if (environment) {
      this.trackCliOption({
        option: 'environment',
        value: environment,
      });
    }
  }
}
