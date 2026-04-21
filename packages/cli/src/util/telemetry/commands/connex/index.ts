import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { connexCommand } from '../../../../commands/connex/command';

export class ConnexTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof connexCommand>
{
  trackCliSubcommandCreate(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'create',
      value: actual,
    });
  }

  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }

  trackCliSubcommandToken(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'token',
      value: actual,
    });
  }

  trackCliOptionLimit(v: number | undefined) {
    if (v !== undefined) {
      this.trackCliOption({
        option: 'limit',
        value: String(v),
      });
    }
  }

  trackCliOptionNext(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'next',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionFormat(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'format',
        value: v,
      });
    }
  }
}
