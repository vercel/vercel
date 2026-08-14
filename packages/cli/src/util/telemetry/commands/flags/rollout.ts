import { TelemetryClient } from '../..';
import { STANDARD_ENVIRONMENTS } from '../../../target/standard-environments';
import type { rolloutSubcommand } from '../../../../commands/flags/command';
import type { TelemetryMethods } from '../../types';

type StandardEnvironment = (typeof STANDARD_ENVIRONMENTS)[number];

export class FlagsRolloutTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof rolloutSubcommand>
{
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

  trackCliOptionFromVariant(variant: string | undefined) {
    if (variant) {
      this.trackCliOption({
        option: 'from-variant',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionToVariant(variant: string | undefined) {
    if (variant) {
      this.trackCliOption({
        option: 'to-variant',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionDefaultVariant(variant: string | undefined) {
    if (variant) {
      this.trackCliOption({
        option: 'default-variant',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionBy(base: string | undefined) {
    if (base) {
      this.trackCliOption({
        option: 'by',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionStage(stages: [string] | undefined) {
    if (stages?.length) {
      this.trackCliOption({
        option: 'stage',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionStart(start: string | undefined) {
    if (start) {
      this.trackCliOption({
        option: 'start',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionMessage(message: string | undefined) {
    if (message) {
      this.trackCliOption({
        option: 'message',
        value: this.redactedValue,
      });
    }
  }
}
