import { TelemetryClient } from '../..';

export class FlagsLsTelemetryClient extends TelemetryClient {
  trackCliOptionState(state: string | undefined) {
    if (state) {
      this.trackCliOption({
        option: 'state',
        value: state,
      });
    }
  }
}
