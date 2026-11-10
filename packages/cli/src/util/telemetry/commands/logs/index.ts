import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { logsCommand } from '../../../../commands/logs/command';

export class LogsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof logsCommand>
{
  /** `actual` is the typed subcommand, or `default` for implicit runtime. */
  trackCliSubcommandRuntime(actual: string) {
    this.trackCliSubcommand({ subcommand: 'runtime', value: actual });
  }

  trackCliSubcommandRequests(actual: string) {
    this.trackCliSubcommand({ subcommand: 'requests', value: actual });
  }

  /**
   * A removed option, recorded by name only, so its migration hint can be
   * retired once nobody uses it.
   */
  trackCliLegacyOption(name: string) {
    this.trackCliOption({ option: name, value: 'removed' });
  }

  /**
   * A positional argument, recorded by kind only: a deployment ID or URL, or
   * an unknown data source. Data sources themselves are subcommands.
   */
  trackCliArgumentPositional(kind: 'deployment' | 'unknown') {
    this.trackCliArgument({ arg: 'positional', value: kind });
  }

  trackCliOptionDeployment(v: string | undefined) {
    if (v) {
      this.trackCliOption({ option: 'deployment', value: this.redactedValue });
    }
  }

  trackCliOptionEnvironment(v: string | undefined) {
    if (v) {
      const value = ['production', 'preview'].includes(v)
        ? v
        : this.redactedValue;
      this.trackCliOption({ option: 'environment', value });
    }
  }

  trackCliOptionQuery(v: string | undefined) {
    if (v !== undefined) {
      this.trackCliOption({ option: 'query', value: this.redactedValue });
    }
  }

  trackCliOptionNext(v: string | undefined) {
    if (v !== undefined) {
      this.trackCliOption({ option: 'next', value: this.redactedValue });
    }
  }

  trackCliOptionFormat(v: string | undefined) {
    if (v) {
      const value = v.toLowerCase() === 'json' ? 'json' : this.redactedValue;
      this.trackCliOption({ option: 'format', value });
    }
  }

  trackCliFlagJson(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('json');
    }
  }

  trackCliOptionLimit(v: number | undefined) {
    if (typeof v === 'number') {
      this.trackCliOption({ option: 'limit', value: this.redactedValue });
    }
  }

  trackCliOptionSince(v: string | undefined) {
    if (v) {
      this.trackCliOption({ option: 'since', value: this.redactedValue });
    }
  }

  trackCliOptionUntil(v: string | undefined) {
    if (v) {
      this.trackCliOption({ option: 'until', value: this.redactedValue });
    }
  }

  trackCliFlagFollow(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('follow');
    }
  }
}
