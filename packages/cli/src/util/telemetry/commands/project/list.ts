import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { listSubcommand } from '../../../../commands/project/command';

export class ProjectListTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof listSubcommand>
{
  trackCliFlagUpdateRequired(updateRequired: boolean | undefined) {
    if (updateRequired) {
      this.trackCliFlag('update-required');
    }
  }

  trackCliFlagPaused(paused: boolean | undefined) {
    if (paused) {
      this.trackCliFlag('paused');
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

  trackCliOptionLimit(limit: number | undefined) {
    if (limit) {
      this.trackCliOption({
        option: 'limit',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }

  trackCliOptionQuery(query: string | undefined) {
    if (query) {
      this.trackCliOption({
        option: 'query',
        value: this.redactedValue,
      });
    }
  }

  // The deprecated name keeps its own key, to measure who still uses it.
  trackCliOptionFilter(filter: string | undefined) {
    if (filter) {
      this.trackCliOption({
        option: 'filter',
        value: this.redactedValue,
      });
    }
  }
}
