import { TelemetryClient } from '../..';

export class CompletionTelemetryClient extends TelemetryClient {
  trackCliArgumentShell(shell: string | undefined) {
    // `shell` is a fixed enum (bash/zsh/fish), so the literal value is safe to
    // record without redaction.
    if (shell) {
      this.trackCliArgument({ arg: 'shell', value: shell });
    }
  }

  trackCliSubcommandInstall() {
    this.trackCliSubcommand({ subcommand: 'install', value: 'install' });
  }
}
