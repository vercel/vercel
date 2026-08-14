import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { commentsCommand } from '../../../../commands/comments/command';

export class CommentsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof commentsCommand>
{
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({ subcommand: 'list', value: actual });
  }

  trackCliSubcommandInspect(actual: string) {
    this.trackCliSubcommand({ subcommand: 'inspect', value: actual });
  }

  trackCliSubcommandOpen(actual: string) {
    this.trackCliSubcommand({ subcommand: 'open', value: actual });
  }

  trackCliSubcommandReply(actual: string) {
    this.trackCliSubcommand({ subcommand: 'reply', value: actual });
  }

  trackCliSubcommandResolve(actual: string) {
    this.trackCliSubcommand({ subcommand: 'resolve', value: actual });
  }

  trackCliSubcommandReopen(actual: string) {
    this.trackCliSubcommand({ subcommand: 'reopen', value: actual });
  }

  trackCliSubcommandEdit(actual: string) {
    this.trackCliSubcommand({ subcommand: 'edit', value: actual });
  }

  trackCliSubcommandDelete(actual: string) {
    this.trackCliSubcommand({ subcommand: 'delete', value: actual });
  }

  trackCliOptionFormat(v: string | undefined) {
    if (v) {
      this.trackCliOption({ option: 'format', value: v });
    }
  }

  trackCliOptionStatus(v: string | undefined) {
    if (v) {
      this.trackCliOption({ option: 'status', value: v });
    }
  }

  trackCliFlagAllBranches(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('all-branches');
    }
  }

  trackCliFlagYes(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('yes');
    }
  }

  trackCliFlagContext(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('context');
    }
  }

  trackCliOptionProject(v: string | undefined) {
    if (v) {
      this.trackCliOption({ option: 'project', value: this.redactedValue });
    }
  }

  trackCliOptionBranch(v: string[] | undefined) {
    if (v && v.length > 0) {
      this.trackCliOption({ option: 'branch', value: this.redactedValue });
    }
  }

  trackCliOptionPage(v: string[] | undefined) {
    if (v && v.length > 0) {
      this.trackCliOption({ option: 'page', value: this.redactedValue });
    }
  }

  trackCliOptionAuthor(v: string[] | undefined) {
    if (v && v.length > 0) {
      this.trackCliOption({ option: 'author', value: this.redactedValue });
    }
  }

  trackCliOptionContentId(v: string[] | undefined) {
    if (v && v.length > 0) {
      this.trackCliOption({ option: 'content-id', value: this.redactedValue });
    }
  }

  trackCliOptionSearch(v: string | undefined) {
    if (v) {
      this.trackCliOption({ option: 'search', value: this.redactedValue });
    }
  }

  trackCliOptionLimit(v: number | undefined) {
    if (typeof v === 'number') {
      this.trackCliOption({ option: 'limit', value: this.redactedValue });
    }
  }

  trackCliOptionNext(v: string | undefined) {
    if (v) {
      this.trackCliOption({ option: 'next', value: this.redactedValue });
    }
  }

  trackCliOptionMessage(v: string | undefined) {
    if (v) {
      this.trackCliOption({ option: 'message', value: this.redactedValue });
    }
  }

  trackCliOptionFile(v: string | undefined) {
    if (v) {
      this.trackCliOption({ option: 'file', value: this.redactedValue });
    }
  }

  trackCliOptionAttach(v: string[] | undefined) {
    if (v && v.length > 0) {
      this.trackCliOption({ option: 'attach', value: this.redactedValue });
    }
  }

  trackCliArgumentThread(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'thread',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentMessageId(v: string | undefined) {
    if (v) {
      this.trackCliArgument({ arg: 'message-id', value: this.redactedValue });
    }
  }

  trackCliArgumentSearch(v: string | undefined) {
    if (v) {
      this.trackCliArgument({ arg: 'search', value: this.redactedValue });
    }
  }
}
