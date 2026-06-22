import { TelemetryClient } from '../..';

export class FlagsSegmentsTelemetryClient extends TelemetryClient {
  trackCliSubcommandList(actual: string) {
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

  trackCliSubcommandCreate(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'create',
      value: actual,
    });
  }

  trackCliSubcommandUpdate(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'update',
      value: actual,
    });
  }

  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'rm',
      value: actual,
    });
  }
}

export class FlagsSegmentsLsTelemetryClient extends TelemetryClient {
  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}

export class FlagsSegmentsInspectTelemetryClient extends TelemetryClient {
  trackCliArgumentSegment(segment: string | undefined) {
    if (segment) {
      this.trackCliArgument({
        arg: 'segment',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}

export class FlagsSegmentsCreateTelemetryClient extends TelemetryClient {
  trackCliArgumentSlug(slug: string | undefined) {
    if (slug) {
      this.trackCliArgument({
        arg: 'slug',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionLabel(label: string | undefined) {
    if (label) {
      this.trackCliOption({
        option: 'label',
        value: this.redactedValue,
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

  trackCliOptionHint(hint: string | undefined) {
    if (hint) {
      this.trackCliOption({
        option: 'hint',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionData(data: string | undefined) {
    if (data) {
      this.trackCliOption({
        option: 'data',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionAdd(add: string[] | undefined) {
    if (add?.length) {
      this.trackCliOption({
        option: 'add',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}

export class FlagsSegmentsUpdateTelemetryClient extends TelemetryClient {
  trackCliArgumentSegment(segment: string | undefined) {
    if (segment) {
      this.trackCliArgument({
        arg: 'segment',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionLabel(label: string | undefined) {
    if (label) {
      this.trackCliOption({
        option: 'label',
        value: this.redactedValue,
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

  trackCliOptionHint(hint: string | undefined) {
    if (hint) {
      this.trackCliOption({
        option: 'hint',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionData(data: string | undefined) {
    if (data) {
      this.trackCliOption({
        option: 'data',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionAdd(add: string[] | undefined) {
    if (add?.length) {
      this.trackCliOption({
        option: 'add',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionRemove(remove: string[] | undefined) {
    if (remove?.length) {
      this.trackCliOption({
        option: 'remove',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}

export class FlagsSegmentsRmTelemetryClient extends TelemetryClient {
  trackCliArgumentSegment(segment: string | undefined) {
    if (segment) {
      this.trackCliArgument({
        arg: 'segment',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
