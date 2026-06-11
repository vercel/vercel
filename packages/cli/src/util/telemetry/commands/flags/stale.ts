import { TelemetryClient } from '../..';

export class FlagsStaleTelemetryClient extends TelemetryClient {
  trackCliOptionState(state: string | undefined) {
    if (state) {
      this.trackCliOption({
        option: 'state',
        value: state,
      });
    }
  }

  trackCliOptionOlderThan(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'older-than',
        value,
      });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
