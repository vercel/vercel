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

  trackCliOptionTag(tags: string[] | undefined) {
    if (tags && tags.length > 0) {
      this.trackCliOption({
        option: 'tag',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionCreatedBy(createdBy: string | undefined) {
    if (createdBy) {
      this.trackCliOption({
        option: 'created-by',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionMaintainerId(maintainerIds: string[] | undefined) {
    if (maintainerIds && maintainerIds.length > 0) {
      this.trackCliOption({
        option: 'maintainer-id',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionLimit(limit: number | undefined) {
    if (limit !== undefined) {
      this.trackCliOption({
        option: 'limit',
        value: String(limit),
      });
    }
  }

  trackCliOptionNext(next: string | undefined) {
    if (next) {
      this.trackCliOption({
        option: 'next',
        value: this.redactedValue,
      });
    }
  }
}
