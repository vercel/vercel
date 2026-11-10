import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { backupsSubcommand } from '../../../../commands/global-config/command';

export class GlobalConfigBackupsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof backupsSubcommand>
{
  trackCliArgumentIdOrSlug(value: string | undefined) {
    this.trackCliArgument({ arg: 'id-or-slug', value });
  }

  trackCliOptionBackupVersion(value: string | undefined) {
    if (value) {
      this.trackCliOption({ option: 'backup-version', value });
    }
  }

  trackCliOptionRestore(value: string | undefined) {
    if (value) {
      this.trackCliOption({ option: 'restore', value });
    }
  }

  trackCliOptionLimit(value: number | undefined) {
    if (value !== undefined) {
      this.trackCliOption({ option: 'limit', value: String(value) });
    }
  }

  trackCliOptionNext(value: string | undefined) {
    if (value) {
      this.trackCliOption({ option: 'next', value: this.redactedValue });
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }

  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({
        option: 'format',
        value: format,
      });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
