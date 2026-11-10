import { TelemetryClient } from '../..';

export class FlagsLabelsTelemetryClient extends TelemetryClient {
  trackSubcommand(subcommand: string, actual: string) {
    this.trackCliSubcommand({ subcommand, value: actual });
  }

  trackArguments(args: string[], flags: Record<string, unknown>) {
    for (const [index, arg] of ['attribute', 'value', 'label'].entries()) {
      if (index < args.length)
        this.trackCliArgument({ arg, value: this.redactedValue });
    }
    this.trackCliOptionProject(flags['--project'] as string | undefined);
    for (const option of ['set', 'remove', 'data', 'next']) {
      if (flags[`--${option}`] !== undefined) {
        this.trackCliOption({ option, value: this.redactedValue });
      }
    }
    if (flags['--limit'] !== undefined) {
      this.trackCliOption({ option: 'limit', value: String(flags['--limit']) });
    }
    if (flags['--json']) this.trackCliFlag('json');
  }
}
