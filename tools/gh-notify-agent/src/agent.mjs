import { GitHubClient } from './github.mjs';
import { buildAlerts } from './filters.mjs';
import { hasSeen, loadState, markSeen, saveState } from './state.mjs';
import { createTerminalNotifier } from './notifiers/terminal.mjs';
import { createSlackNotifier } from './notifiers/slack.mjs';
import { createDesktopNotifier } from './notifiers/desktop.mjs';

/**
 * Run a single polling cycle:
 *   1. Load persisted state.
 *   2. Fetch unread notifications since last poll (or N days back on first run).
 *   3. Filter them down to the signals we care about.
 *   4. Drop anything we've already alerted on.
 *   5. Emit to configured notifiers and persist state.
 */
export async function runOnce(config, { verbose = false } = {}) {
  const client = new GitHubClient({ token: config.token, apiBase: config.apiBase });
  const user = await client.getAuthenticatedUser();

  const state = await loadState(config.stateFile);
  const since = computeSince(state.lastPollAt, config.sinceDays);

  const notifications = await client.listNotifications({
    since,
    participating: false,
    all: false,
  });

  if (verbose) {
    process.stderr.write(
      `[gh-notify-agent] user=${user.login} since=${since} notifications=${notifications.length}\n`
    );
  }

  const alerts = await buildAlerts({
    client,
    user,
    notifications,
    extraBotLogins: config.extraBotLogins,
    includeReviewRequests: config.includeReviewRequests,
    since,
  });

  const fresh = alerts.filter(a => !hasSeen(state, a.id));

  const sinks = buildSinks(config);
  for (const alert of fresh) {
    for (const sink of sinks) {
      try {
        await sink.notify(alert);
      } catch (err) {
        process.stderr.write(
          `[gh-notify-agent] notifier failed (${sink.name || 'anon'}): ${err.message}\n`
        );
      }
    }
    markSeen(state, alert.id);
  }

  state.lastPollAt = new Date().toISOString();
  await saveState(config.stateFile, state);

  return { user, notificationsCount: notifications.length, alerts: fresh };
}

/**
 * Long-running watch loop. Polls every `pollSeconds`, logs errors to stderr
 * but never exits unless SIGINT/SIGTERM is received.
 */
export async function runWatch(config, { verbose = false } = {}) {
  let running = true;
  const stop = () => {
    running = false;
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  while (running) {
    const start = Date.now();
    try {
      const { alerts, notificationsCount } = await runOnce(config, { verbose });
      if (verbose) {
        process.stderr.write(
          `[gh-notify-agent] tick: ${alerts.length} new alert(s) from ${notificationsCount} notifications\n`
        );
      }
    } catch (err) {
      process.stderr.write(`[gh-notify-agent] poll failed: ${err.message}\n`);
    }
    const elapsed = Date.now() - start;
    const wait = Math.max(5_000, config.pollSeconds * 1000 - elapsed);
    await sleep(wait, () => !running);
  }
}

function buildSinks(config) {
  const sinks = [];
  if (config.useTerminal) {
    const s = createTerminalNotifier();
    s.name = 'terminal';
    sinks.push(s);
  }
  if (config.slackWebhookUrl) {
    const s = createSlackNotifier({ webhookUrl: config.slackWebhookUrl });
    if (s) {
      s.name = 'slack';
      sinks.push(s);
    }
  }
  if (config.useDesktop) {
    const s = createDesktopNotifier();
    s.name = 'desktop';
    sinks.push(s);
  }
  return sinks;
}

function computeSince(lastPollAt, sinceDays) {
  if (lastPollAt) return lastPollAt;
  const d = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

function sleep(ms, shouldAbort) {
  return new Promise(resolve => {
    const step = 250;
    let waited = 0;
    const timer = setInterval(() => {
      waited += step;
      if (waited >= ms || (shouldAbort && shouldAbort())) {
        clearInterval(timer);
        resolve();
      }
    }, step);
  });
}
