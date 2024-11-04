import { TelemetryClient } from '../..';

export class TeamsSwitchTelemetryClient extends TelemetryClient {
  trackCliArgumentDesiredSlug(slug?: string) {
    if (slug) {
      this.trackCliArgument({
        arg: 'slug',
        value: this.redactedValue,
      });
    }
  }
}
