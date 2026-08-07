import { TelemetryClient } from '../..';
import { STANDARD_ENVIRONMENTS } from '../../../target/standard-environments';
import type {
  versionsDiffSubcommand,
  versionsListSubcommand,
  versionsSubcommand,
} from '../../../../commands/flags/command';
import type { TelemetryMethods } from '../../types';

type StandardEnvironment = (typeof STANDARD_ENVIRONMENTS)[number];

export class FlagsVersionsTelemetryClient
  extends TelemetryClient
  implements
    TelemetryMethods<typeof versionsSubcommand>,
    TelemetryMethods<typeof versionsListSubcommand>,
    TelemetryMethods<typeof versionsDiffSubcommand>
{
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }

  trackCliSubcommandDiff(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'diff',
      value: actual,
    });
  }

  trackCliArgumentFlag(flag: string | undefined) {
    if (flag) {
      this.trackCliArgument({
        arg: 'flag',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionEnvironment(environment: string | undefined) {
    if (environment) {
      this.trackCliOption({
        option: 'environment',
        value: STANDARD_ENVIRONMENTS.includes(
          environment as StandardEnvironment
        )
          ? environment
          : this.redactedValue,
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

  trackCliOptionCursor(cursor: string | undefined) {
    if (cursor) {
      this.trackCliOption({
        option: 'cursor',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionRevision(revision: number | undefined) {
    if (revision !== undefined) {
      this.trackCliOption({
        option: 'revision',
        value: String(revision),
      });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
