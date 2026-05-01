# gh-notify-agent

A small Node agent that filters the firehose of GitHub notifications down to
the signals that actually matter:

- **CI failures** on PRs you authored
- **@mentions** of you in issue/PR comments (including review comments)
- **Real-human comments and reviews** on PRs you authored (bots, Dependabot,
  `github-actions[bot]`, and your own comments are filtered out)
- *(optional)* **Review requests** where someone asked you to review their PR

It can emit to your **terminal**, a **Slack Incoming Webhook**, and/or native
**desktop notifications** (macOS / Linux / Windows).

It runs as a one-shot (`once`) for cron/launchd/systemd setups, or as a
long-lived watcher (`watch`) that polls on an interval.

## Requirements

- Node **20+** (uses global `fetch`, `node:util.parseArgs`, etc. — zero npm deps)
- A GitHub token exported as `GITHUB_TOKEN` (or `GH_TOKEN`)
  - Classic PAT: `notifications` + `repo` scopes
  - Fine-grained: `Notifications: Read`, `Pull requests: Read`, `Contents: Read`,
    `Checks: Read`, `Metadata: Read`

## Quick start

```bash
cd tools/gh-notify-agent

export GITHUB_TOKEN=ghp_...

# Run a single poll; prints any matching alerts to stdout
node src/cli.mjs once --verbose

# Run continuously, polling every 60s, also posting to Slack
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/XXX/YYY/ZZZ"
node src/cli.mjs watch --verbose
```

Or install globally:

```bash
cd tools/gh-notify-agent
npm link      # creates a `gh-notify-agent` binary on PATH
gh-notify-agent watch
```

## CLI

```
gh-notify-agent [command] [options]

Commands:
  once     Run a single poll and exit (great for cron / launchd / systemd timers)
  watch    Poll forever on an interval (default)

Options:
  --poll-seconds <n>      Poll interval for watch mode (default 60)
  --slack-webhook <url>   Slack Incoming Webhook URL
  --desktop               Also emit native desktop notifications
  --no-terminal           Suppress terminal output
  --state-file <path>     Override state file location
  --verbose               Log diagnostic info to stderr
  --help
```

## Environment variables

| Variable                              | Purpose                                                            |
| ------------------------------------- | ------------------------------------------------------------------ |
| `GITHUB_TOKEN` / `GH_TOKEN`           | **Required.** GitHub API token.                                    |
| `SLACK_WEBHOOK_URL`                   | If set, alerts are also posted to Slack.                           |
| `GH_NOTIFY_POLL_SECONDS`              | Poll interval (default `60`).                                      |
| `GH_NOTIFY_DESKTOP=1`                 | Enable native desktop notifications.                               |
| `GH_NOTIFY_TERMINAL=0`                | Disable terminal output.                                           |
| `GH_NOTIFY_BOT_LOGINS`                | CSV of extra logins to treat as bots (e.g. `renovate-bot,codecov`).|
| `GH_NOTIFY_INCLUDE_REVIEW_REQUESTS=0` | Suppress review-request alerts.                                    |
| `GH_NOTIFY_SINCE_DAYS`                | How far back to look on first run (default `3`).                   |
| `GH_NOTIFY_STATE_FILE`                | State file path (default `~/.cache/gh-notify-agent/state.json`).   |

## How the filters work

For every unread thread returned by `GET /notifications`, the agent decides
which category (if any) it belongs to:

- `reason: "ci_activity"` on a PR you authored → look up check runs + combined
  status on the PR's head SHA; emit `ci_failure` if any are `failure` /
  `timed_out` / `action_required` / `error`.
- `reason: "mention"` or `"team_mention"` → fetch issue comments + review
  comments since last poll and emit `mention` for any that actually contain
  `@yourlogin` (GitHub's `mention` reason is often false-positive on big
  threads).
- `reason: "author"` / `"comment"` / `"subscribed"` on a PR you authored →
  fetch comments/reviews since last poll; emit `pr_comment` only for ones
  authored by a non-bot, non-you account.
- `reason: "review_requested"` → emit `review_request` (toggle off via
  `GH_NOTIFY_INCLUDE_REVIEW_REQUESTS=0`).

Everything else — releases, stars, watched-repo chatter, Dependabot
auto-comments on your own PRs, activity on threads you're merely subscribed
to — is dropped.

Alerts are de-duped across runs via a SHA1 of `(type, repo, pr#, inner-id)`
stored in a small state file. The state also tracks `lastPollAt` so each
run only fetches comments/reviews created since the previous run.

## Deploying

### cron (every 2 minutes)

```cron
*/2 * * * * GITHUB_TOKEN=ghp_... /usr/bin/node /path/to/tools/gh-notify-agent/src/cli.mjs once >>/var/log/gh-notify-agent.log 2>&1
```

### systemd user service

```ini
# ~/.config/systemd/user/gh-notify-agent.service
[Unit]
Description=GitHub notifications agent

[Service]
Environment=GITHUB_TOKEN=ghp_...
Environment=SLACK_WEBHOOK_URL=https://hooks.slack.com/services/XXX/YYY/ZZZ
ExecStart=/usr/bin/node %h/code/tools/gh-notify-agent/src/cli.mjs watch --verbose
Restart=always

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now gh-notify-agent
```

### macOS launchd

Create `~/Library/LaunchAgents/dev.gh-notify-agent.plist` with
`ProgramArguments` pointing at `node src/cli.mjs watch`, then
`launchctl load` it. Set `GITHUB_TOKEN` via
`launchctl setenv GITHUB_TOKEN ...` or an `EnvironmentVariables` dict.

## Extending

All filter logic lives in [`src/filters.mjs`](./src/filters.mjs) — it's one
pure-ish function `buildAlerts({ client, user, notifications, ... })` that
returns a list of `{ id, type, severity, title, body, url, ... }` alerts.

To add a new sink (email, Discord, ntfy, Pushover, …) drop a new module under
[`src/notifiers/`](./src/notifiers/) that exposes `{ notify(alert) }`, wire it
up in [`src/agent.mjs`](./src/agent.mjs)'s `buildSinks()`, and expose a flag
in [`src/cli.mjs`](./src/cli.mjs).

## Limitations

- Uses GitHub's REST notifications API, which only surfaces *unread* items
  from the last ~5 days. Anything you already read in the GitHub UI won't
  re-appear here.
- The "CI failure" detector hits `check-runs` + combined status for each
  affected PR head SHA. For repos with huge numbers of checks you may want to
  raise `GH_NOTIFY_POLL_SECONDS` to stay comfortably inside the 5000 req/hr
  primary rate limit.
- Desktop notifications on Linux require `notify-send`; on Windows they
  require the `BurntToast` PowerShell module. Missing either is a silent
  no-op.
