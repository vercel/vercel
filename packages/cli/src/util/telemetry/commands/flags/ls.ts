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

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
