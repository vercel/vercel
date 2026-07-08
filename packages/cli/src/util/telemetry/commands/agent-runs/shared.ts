import { TelemetryClient } from '../..';

/** Shared trackers for the Agent Runs query flags used by several subcommands. */
export class AgentRunsQueryTelemetryClient extends TelemetryClient {
  trackCliOptionEnvironment(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'environment',
        value: ['production', 'preview'].includes(value)
          ? value
          : this.redactedValue,
      });
    }
  }

  trackCliOptionSince(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'since',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionUntil(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'until',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionProject(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'project',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionStaleThreshold(value: number | undefined) {
    if (typeof value === 'number') {
      this.trackCliOption({
        option: 'stale-threshold',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionIssueCode(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'issue-code',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionIssueTool(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'issue-tool',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagJson(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('json');
    }
  }
}
