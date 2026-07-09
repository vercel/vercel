import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { vcrCommand } from '../../../../commands/vcr/command';

export class VcrTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof vcrCommand>
{
  trackCliSubcommandLs(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'ls',
      value: actual,
    });
  }

  trackCliSubcommandInspect(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'inspect',
      value: actual,
    });
  }

  trackCliSubcommandAdd(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'add',
      value: actual,
    });
  }

  trackCliSubcommandRm(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'rm',
      value: actual,
    });
  }

  trackCliSubcommandLogin(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'login',
      value: actual,
    });
  }

  trackCliArgumentEngine(value: string | undefined) {
    if (value) {
      // Engine is a bounded enum (docker|podman|buildah), so it is safe to
      // record the actual value rather than redacting it.
      this.trackCliArgument({
        arg: 'engine',
        value,
      });
    }
  }

  trackCliSubcommandTag(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'tag',
      value: actual,
    });
  }

  trackCliSubcommandImage(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'image',
      value: actual,
    });
  }

  trackCliOptionLimit(value: number | undefined) {
    if (typeof value === 'number') {
      this.trackCliOption({
        option: 'limit',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionCursor(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'cursor',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionSortBy(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'sort-by',
        value,
      });
    }
  }

  trackCliOptionSortOrder(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'sort-order',
        value,
      });
    }
  }

  trackCliFlagUntagged(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('untagged');
    }
  }

  trackCliFlagYes(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('yes');
    }
  }
}
