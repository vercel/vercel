import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type * as commands from '../../../../commands/daemons/command';

type Methods<K extends keyof typeof commands> = TelemetryMethods<
  (typeof commands)[K]
>;

/** Telemetry for every daemons command. Values are redacted. */
export class DaemonsTelemetryClient
  extends TelemetryClient
  implements
    Methods<'daemonsCommand'>,
    Methods<'instancesSubcommand'>,
    Methods<'listSubcommand'>,
    Methods<'inspectSubcommand'>,
    Methods<'scaleSubcommand'>,
    Methods<'instancesListSubcommand'>,
    Methods<'instancesInspectSubcommand'>,
    Methods<'instancesRestartSubcommand'>
{
  private sub = (subcommand: string) => (value: string) =>
    this.trackSubcommand(subcommand, value);
  private arg = (arg: string) => (value?: string) =>
    this.trackCliArgument({ arg, value: value && this.redactedValue });
  private option = (option: string) => (value?: string) =>
    this.trackRedactedCliOption(option, value);
  private flag = (flag: string) => (value?: boolean) => {
    if (value) this.trackCliFlag(flag);
  };

  trackCliSubcommandList = this.sub('list');
  trackCliSubcommandScale = this.sub('scale');
  trackCliSubcommandInstances = this.sub('instances');
  trackCliSubcommandInspect = this.sub('inspect');
  trackCliSubcommandRestart = this.sub('restart');
  trackCliArgumentDaemon = this.arg('daemon');
  trackCliArgumentInstance = this.arg('instance');
  trackCliOptionNext = this.option('next');
  trackCliOptionSince = this.option('since');
  trackCliOptionUntil = this.option('until');
  trackCliFlagReset = this.flag('reset');
  trackCliFlagJson = this.flag('json');

  trackSubcommand(subcommand: string, value: string) {
    this.trackCliSubcommand({ subcommand, value });
  }

  trackCliArgumentOverrides(value: string[]) {
    const count = value.length ? String(value.length) : undefined;
    this.trackCliArgument({ arg: 'overrides', value: count });
  }

  trackCliOptionLimit(value: number | undefined) {
    if (value === undefined) return;
    this.trackCliOption({ option: 'limit', value: String(value) });
  }

  /** Tracks every option a daemons subcommand accepts. */
  trackOptions(flags: {
    '--project'?: string;
    '--limit'?: number;
    '--next'?: string;
    '--since'?: string;
    '--until'?: string;
    '--reset'?: boolean;
    '--format'?: string;
    '--json'?: boolean;
  }) {
    this.trackCliOptionProject(flags['--project']);
    this.trackCliOptionLimit(flags['--limit']);
    this.trackCliOptionNext(flags['--next']);
    this.trackCliOptionSince(flags['--since']);
    this.trackCliOptionUntil(flags['--until']);
    this.trackCliFlagReset(flags['--reset']);
    this.trackCliOptionFormat(flags['--format']);
    this.trackCliFlagJson(flags['--json']);
  }
}
