import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { logsCommand } from '../../../../commands/logs/command';

export class LogsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof logsCommand>
{
  trackCliArgumentUrlOrDeploymentId(path: string | undefined) {
    if (path) {
      this.trackCliArgument({
        arg: 'urlOrDeploymentId',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagJson(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('json');
    }
  }

  trackCliFlagFollow(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('follow');
    }
  }

  trackCliOptionLimit(n: number | undefined) {
    if (typeof n === 'number') {
      this.trackCliOption({
        option: 'limit',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionSince(n: string | undefined) {
    if (n) {
      this.trackCliOption({
        option: 'since',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionUntil(n: string | undefined) {
    if (n) {
      this.trackCliOption({
        option: 'until',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionOutput(outputMode: string | undefined) {
    if (outputMode) {
      const allowedOutputMode = ['raw', 'short'].includes(outputMode)
        ? outputMode
        : this.redactedValue;
      this.trackCliOption({
        option: 'output',
        value: allowedOutputMode,
      });
    }
  }
}
