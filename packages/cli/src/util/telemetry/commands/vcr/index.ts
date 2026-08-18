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

  trackCliSubcommandBuild(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'build',
      value: actual,
    });
  }

  trackCliSubcommandPush(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'push',
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

  trackCliArgumentPath(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'path',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentName(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'name',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionPlatform(value: string | undefined) {
    if (value) {
      // Platform is effectively a bounded set; record the common values and
      // redact anything else so custom platform strings never leak.
      const known = value === 'linux/amd64' || value === 'linux/arm64';
      this.trackCliOption({
        option: 'platform',
        value: known ? value : this.redactedValue,
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

  trackCliSubcommandPermissions(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'permissions',
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

  trackCliFlagPush(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('push');
    }
  }
}
