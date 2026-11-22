import { TelemetryClient } from '../..';

export class FlagsEntitiesTelemetryClient extends TelemetryClient {
  trackSubcommand(subcommand: string, actual: string) {
    this.trackCliSubcommand({ subcommand, value: actual });
  }

  trackArguments(args: string[], flags: Record<string, unknown>) {
    if (args[0]) {
      this.trackCliArgument({ arg: 'kind', value: this.redactedValue });
    }
    this.trackCliOptionProject(flags['--project'] as string | undefined);
    for (const option of [
      'label',
      'attribute',
      'add-attribute',
      'remove-attribute',
      'set-attribute-type',
    ]) {
      const value = flags[`--${option}`];
      if (
        typeof value === 'string'
          ? value.trim()
          : Array.isArray(value) && value.length
      ) {
        this.trackCliOption({ option, value: this.redactedValue });
      }
    }
    for (const flag of ['json', 'yes']) {
      if (flags[`--${flag}`]) this.trackCliFlag(flag);
    }
  }
}
