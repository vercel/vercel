import { TelemetryClient } from '../..';
import type { evaluationsSubcommand } from '../../../../commands/flags/command';
import { isFlagEvaluationsGranularity } from '../../../../commands/flags/evaluations-config';
import type { TelemetryMethods } from '../../types';

export class FlagsEvaluationsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof evaluationsSubcommand>
{
  trackCliArgumentFlag(flag: string | undefined) {
    if (flag) {
      this.trackCliArgument({
        arg: 'flag',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionSince(since: string | undefined) {
    if (since) {
      this.trackCliOption({
        option: 'since',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionUntil(until: string | undefined) {
    if (until) {
      this.trackCliOption({
        option: 'until',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionGranularity(granularity: string | undefined) {
    if (granularity) {
      this.trackCliOption({
        option: 'granularity',
        value: isFlagEvaluationsGranularity(granularity)
          ? granularity
          : this.redactedValue,
      });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
