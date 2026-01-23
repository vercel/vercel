import { TelemetryClient } from '../..';

export class FlagsLsTelemetryClient extends TelemetryClient {
  trackCliArgumentFlag(flag: string | undefined) {
    if (flag) {
      this.trackCliArgument({
        arg: 'flag',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionState(state: string | undefined) {
    if (state) {
      this.trackCliOption({
        option: 'state',
        value: state,
      });
    }
  }
}
