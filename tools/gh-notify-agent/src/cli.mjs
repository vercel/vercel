#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { loadConfig } from './config.mjs';
import { runOnce, runWatch } from './agent.mjs';

const USAGE = `gh-notify-agent — filter GitHub notifications to the ones you care about

Usage:
  gh-notify-agent once            Run a single poll and exit
  gh-notify-agent watch           Poll continuously (default if no command given)
  gh-notify-agent --help

Options:
  --poll-seconds <n>   Polling interval for watch mode (default 60)
  --slack-webhook <u>  Slack Incoming Webhook URL to post alerts to
  --desktop            Also emit native desktop notifications
  --no-terminal        Don't print alerts to the terminal
  --verbose            Print diagnostic info to stderr
  --state-file <path>  Override state file location

Environment:
  GITHUB_TOKEN                 Required. Needs \`notifications\` + \`repo\` scopes.
  SLACK_WEBHOOK_URL            Same as --slack-webhook.
  GH_NOTIFY_POLL_SECONDS       Same as --poll-seconds.
  GH_NOTIFY_DESKTOP=1          Same as --desktop.
  GH_NOTIFY_BOT_LOGINS         Comma-separated extra bot logins to ignore.
  GH_NOTIFY_INCLUDE_REVIEW_REQUESTS=0  Suppress review-request alerts.
  GH_NOTIFY_SINCE_DAYS         How far back to look on first run (default 3).
  GH_NOTIFY_STATE_FILE         State file path.

Signals emitted:
  ci_failure      Failing check/CI runs on your PRs.
  mention         @you in a PR or issue comment.
  pr_comment      Real humans (not bots, not yourself) commenting or reviewing
                  on PRs you authored.
  review_request  Someone requested you as a reviewer (opt-out).
`;

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      verbose: { type: 'boolean', short: 'v' },
      'poll-seconds': { type: 'string' },
      'slack-webhook': { type: 'string' },
      desktop: { type: 'boolean' },
      'no-terminal': { type: 'boolean' },
      'state-file': { type: 'string' },
    },
  });

  if (values.help) {
    process.stdout.write(USAGE);
    return;
  }

  const command = positionals[0] || 'watch';

  let config;
  try {
    config = loadConfig({
      pollSeconds: values['poll-seconds'],
      slackWebhookUrl: values['slack-webhook'],
      useDesktop: values.desktop ? '1' : undefined,
      useTerminal: values['no-terminal'] ? '0' : undefined,
      stateFile: values['state-file'],
    });
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n\n${USAGE}`);
    process.exit(2);
  }

  if (command === 'once') {
    const { alerts } = await runOnce(config, { verbose: values.verbose });
    if (values.verbose) {
      process.stderr.write(`[gh-notify-agent] emitted ${alerts.length} alert(s)\n`);
    }
    return;
  }

  if (command === 'watch') {
    await runWatch(config, { verbose: values.verbose });
    return;
  }

  process.stderr.write(`Unknown command: ${command}\n\n${USAGE}`);
  process.exit(2);
}

main().catch(err => {
  process.stderr.write(`[gh-notify-agent] fatal: ${err.stack || err.message || err}\n`);
  process.exit(1);
});
