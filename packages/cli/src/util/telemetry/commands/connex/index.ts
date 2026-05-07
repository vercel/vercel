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

  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'remove',
      value: actual,
    });
  }

  trackCliSubcommandOpen(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'open',
      value: actual,
    });
  }

  trackCliArgumentClient(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'client',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagYes(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('yes');
    }
  }

  trackCliFlagDisconnectAll(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('disconnect-all');
    }
  }

  trackCliFlagAll(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('all');
    }
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
