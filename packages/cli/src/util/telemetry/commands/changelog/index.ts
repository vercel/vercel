import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { changelogCommand } from '../../../../commands/changelog/command';

export class ChangelogTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof changelogCommand>
{
  trackCliSubcommandSearch(actual: string) {
    this.trackCliSubcommand({ subcommand: 'search', value: actual });
  }

  trackCliOptionLimit(limit: number | undefined) {
    if (limit !== undefined) {
      this.trackCliOption({ option: 'limit', value: String(limit) });
    }
  }

  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({ option: 'format', value: format });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
