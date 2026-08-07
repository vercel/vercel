import { TelemetryClient } from '../..';
import { STANDARD_ENVIRONMENTS } from '../../../target/standard-environments';

type StandardEnvironment = (typeof STANDARD_ENVIRONMENTS)[number];

export class FlagsRulesTelemetryClient extends TelemetryClient {
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'ls',
      value: actual,
    });
  }

  trackCliSubcommandAdd(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'add',
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

  trackCliSubcommandMove(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'move',
      value: actual,
    });
  }
}

export class FlagsRulesCommandTelemetryClient extends TelemetryClient {
  trackCliArgumentFlag(flag: string | undefined) {
    if (flag) {
      this.trackCliArgument({
        arg: 'flag',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentRule(rule: string | undefined) {
    if (rule) {
      this.trackCliArgument({
        arg: 'rule',
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

  trackCliOptionCondition(condition: string[] | undefined) {
    if (condition?.length) {
      this.trackCliOption({
        option: 'condition',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionVariant(variant: string | undefined) {
    if (variant) {
      this.trackCliOption({
        option: 'variant',
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

  trackCliOptionWeight(weights: string[] | undefined) {
    if (weights?.length) {
      this.trackCliOption({
        option: 'weight',
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

  trackCliOptionStage(stages: string[] | undefined) {
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

  trackCliOptionPosition(position: number | undefined) {
    if (position !== undefined) {
      this.trackCliOption({
        option: 'position',
        value: String(position),
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

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
