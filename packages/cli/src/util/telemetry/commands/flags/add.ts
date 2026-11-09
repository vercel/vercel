import { TelemetryClient } from '../..';
import {
  STANDARD_ENVIRONMENTS,
  type StandardEnvironment,
} from '../../../target/standard-environments';
import type { createSubcommand } from '../../../../commands/flags/command';
import type { TelemetryMethods } from '../../types';

export class FlagsCreateTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof createSubcommand>
{
  trackCliArgumentSlug(slug: string | undefined) {
    if (slug) {
      this.trackCliArgument({
        arg: 'slug',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionKind(kind: string | undefined) {
    if (kind) {
      this.trackCliOption({
        option: 'kind',
        value: kind,
      });
    }
  }

  trackCliOptionDescription(description: string | undefined) {
    if (description) {
      this.trackCliOption({
        option: 'description',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionVariant(variants: string[] | undefined) {
    if (variants?.length) {
      this.trackCliOption({
        option: 'variant',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionDefaultVariant(defaultVariant: string | undefined) {
    if (defaultVariant) {
      this.trackCliOption({
        option: 'default-variant',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionEnvironmentVariant(environmentVariants: string[] | undefined) {
    if (environmentVariants?.length) {
      const environments = environmentVariants.map(input =>
        input.split('=')[0].trim()
      );
      const allStandard = environments.every(environment =>
        STANDARD_ENVIRONMENTS.includes(environment as StandardEnvironment)
      );
      this.trackCliOption({
        option: 'environment-variant',
        value: allStandard
          ? STANDARD_ENVIRONMENTS.filter(environment =>
              environments.includes(environment)
            ).join(',')
          : this.redactedValue,
      });
    }
  }
}
