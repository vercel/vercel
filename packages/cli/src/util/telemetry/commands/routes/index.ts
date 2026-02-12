import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type {
  routesCommand,
  addSubcommand,
} from '../../../../commands/routes/command';

export class RoutesTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof routesCommand>
{
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }

  trackCliSubcommandListVersions(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list-versions',
      value: actual,
    });
  }

  trackCliSubcommandInspect(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'inspect',
      value: actual,
    });
  }

  trackCliSubcommandAdd(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'add',
      value: actual,
    });
  }

  trackCliSubcommandPublish(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'publish',
      value: actual,
    });
  }

  trackCliSubcommandRestore(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'restore',
      value: actual,
    });
  }

  trackCliSubcommandDiscardStaging(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'discard-staging',
      value: actual,
    });
  }
}

/**
 * Telemetry client for the `routes add` subcommand.
 * Tracks flag usage to understand how users create routes.
 */
export class RoutesAddTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof addSubcommand>
{
  // Argument tracking
  trackCliArgumentName(name: string | undefined) {
    if (name) {
      this.trackCliArgument({
        arg: 'name',
        value: this.redactedValue,
      });
    }
  }

  // Flag tracking
  trackCliFlagYes(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('yes');
    }
  }

  trackCliFlagDisabled(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('disabled');
    }
  }

  // Option tracking
  trackCliOptionSrc(src: string | undefined) {
    if (src) {
      this.trackCliOption({
        option: 'src',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionSrcSyntax(syntax: string | undefined) {
    if (syntax) {
      this.trackCliOption({
        option: 'src-syntax',
        value: syntax,
      });
    }
  }

  trackCliOptionAction(action: string | undefined) {
    if (action) {
      this.trackCliOption({
        option: 'action',
        value: action,
      });
    }
  }

  trackCliOptionDest(dest: string | undefined) {
    if (dest) {
      this.trackCliOption({
        option: 'dest',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionStatus(status: number | undefined) {
    if (status !== undefined) {
      this.trackCliOption({
        option: 'status',
        value: String(status),
      });
    }
  }

  trackCliOptionPosition(position: string | undefined) {
    if (position) {
      // Redact the reference ID from position values like "after:abc123"
      const placement = position.split(':')[0];
      this.trackCliOption({
        option: 'position',
        value: placement,
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

  // Response header options
  trackCliOptionSetResponseHeader(headers: [string] | undefined) {
    if (headers && headers.length > 0) {
      this.trackCliOption({
        option: 'set-response-header',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionAppendResponseHeader(headers: [string] | undefined) {
    if (headers && headers.length > 0) {
      this.trackCliOption({
        option: 'append-response-header',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionDeleteResponseHeader(headers: [string] | undefined) {
    if (headers && headers.length > 0) {
      this.trackCliOption({
        option: 'delete-response-header',
        value: this.redactedValue,
      });
    }
  }

  // Request header options
  trackCliOptionSetRequestHeader(headers: [string] | undefined) {
    if (headers && headers.length > 0) {
      this.trackCliOption({
        option: 'set-request-header',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionAppendRequestHeader(headers: [string] | undefined) {
    if (headers && headers.length > 0) {
      this.trackCliOption({
        option: 'append-request-header',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionDeleteRequestHeader(headers: [string] | undefined) {
    if (headers && headers.length > 0) {
      this.trackCliOption({
        option: 'delete-request-header',
        value: this.redactedValue,
      });
    }
  }

  // Request query options
  trackCliOptionSetRequestQuery(params: [string] | undefined) {
    if (params && params.length > 0) {
      this.trackCliOption({
        option: 'set-request-query',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionAppendRequestQuery(params: [string] | undefined) {
    if (params && params.length > 0) {
      this.trackCliOption({
        option: 'append-request-query',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionDeleteRequestQuery(params: [string] | undefined) {
    if (params && params.length > 0) {
      this.trackCliOption({
        option: 'delete-request-query',
        value: this.redactedValue,
      });
    }
  }

  // Condition options
  trackCliOptionHas(conditions: [string] | undefined) {
    if (conditions && conditions.length > 0) {
      this.trackCliOption({
        option: 'has',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionMissing(conditions: [string] | undefined) {
    if (conditions && conditions.length > 0) {
      this.trackCliOption({
        option: 'missing',
        value: this.redactedValue,
      });
    }
  }

  // Custom tracking methods (not part of interface, but useful)
  trackCliActionType(actionType: string) {
    this.trackCliOption({
      option: 'action-type',
      value: actionType,
    });
  }

  trackCliFlagHasConditions(hasConditions: boolean) {
    if (hasConditions) {
      this.trackCliFlag('has-conditions');
    }
  }

  trackCliFlagMissingConditions(hasMissingConditions: boolean) {
    if (hasMissingConditions) {
      this.trackCliFlag('missing-conditions');
    }
  }

  trackCliFlagResponseHeaders(hasResponseHeaders: boolean) {
    if (hasResponseHeaders) {
      this.trackCliFlag('response-headers');
    }
  }

  trackCliFlagRequestTransforms(hasRequestTransforms: boolean) {
    if (hasRequestTransforms) {
      this.trackCliFlag('request-transforms');
    }
  }
}
