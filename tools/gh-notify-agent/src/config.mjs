import { homedir } from 'node:os';
import { join } from 'node:path';

function parseBoolean(value, fallback) {
  if (value === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

function parseCsv(value) {
  if (!value) return [];
  return value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

export function loadConfig(overrides = {}) {
  const token = overrides.token ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!token) {
    throw new Error(
      'Missing GitHub token. Set GITHUB_TOKEN (or GH_TOKEN). ' +
        'The token needs the `notifications` and `repo` scopes (classic PAT) ' +
        'or the equivalent fine-grained permissions.'
    );
  }

  const pollSeconds = Number(
    overrides.pollSeconds ?? process.env.GH_NOTIFY_POLL_SECONDS ?? 60
  );

  return {
    token,
    apiBase: process.env.GITHUB_API_URL || 'https://api.github.com',
    pollSeconds: Number.isFinite(pollSeconds) && pollSeconds > 0 ? pollSeconds : 60,
    // Output sinks
    slackWebhookUrl: overrides.slackWebhookUrl ?? process.env.SLACK_WEBHOOK_URL ?? '',
    useDesktop: parseBoolean(
      overrides.useDesktop ?? process.env.GH_NOTIFY_DESKTOP,
      false
    ),
    useTerminal: parseBoolean(
      overrides.useTerminal ?? process.env.GH_NOTIFY_TERMINAL,
      true
    ),
    // Filters
    // Extra logins to treat as bots (in addition to type==='Bot' and `*[bot]` heuristic).
    extraBotLogins: parseCsv(process.env.GH_NOTIFY_BOT_LOGINS),
    // If true, also include review_requested notifications.
    includeReviewRequests: parseBoolean(
      process.env.GH_NOTIFY_INCLUDE_REVIEW_REQUESTS,
      true
    ),
    // Only consider notifications within N days (GitHub's default window is ~5).
    sinceDays: Number(process.env.GH_NOTIFY_SINCE_DAYS ?? 3),
    // Persistent state file for de-duping.
    stateFile:
      overrides.stateFile ??
      process.env.GH_NOTIFY_STATE_FILE ??
      join(homedir(), '.cache', 'gh-notify-agent', 'state.json'),
  };
}
