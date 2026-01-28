import { TelemetryClient } from '../..';

export class FlagsAddTelemetryClient extends TelemetryClient {
  trackCliArgumentSlug(slug: string | undefined) {
    if (slug) {
      this.trackCliArgument({
        arg: 'slug',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionKind(kind: string | undefined) {
    if (kind) {
      this.trackCliOption({
        option: 'kind',
        value: kind,
      });
    }
  }

  trackCliOptionDescription(description: string | undefined) {
    if (description) {
      this.trackCliOption({
        option: 'description',
        value: this.redactedValue,
      });
    }
  }
}
