import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { shipCommand } from '../../../../commands/ship/command';

export class ShipTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof shipCommand>
{
  trackCliArgumentPath(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'path',
        value: this.redactedValue,
      });
    }
  }

  /**
   * The harness id comes from a fixed, non-sensitive set, so the value is
   * recorded verbatim to show which agents are actually used.
   */
  trackCliOptionHarness(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'harness',
        value: this.redactedValue,
      });
    }
  }

  /** Path to a user-supplied instructions file. Always redacted. */
  trackCliOptionPrompt(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'prompt',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagListHarnesses(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('list-harnesses');
    }
  }

  trackCliFlagPrintPrompt(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('print-prompt');
    }
  }

  trackCliFlagDryRun(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('dry-run');
    }
  }

  trackCliFlagVerbose(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('verbose');
    }
  }

  trackCliFlagJson(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('json');
    }
  }

  trackCliFlagYes(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('yes');
    }
  }
}
