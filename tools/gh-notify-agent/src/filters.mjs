import { createHash } from 'node:crypto';

/**
 * Given the stream of unread notifications + the authed user, produce a list
 * of alerts corresponding to signals the user actually cares about.
 *
 * Signal types:
 *   - `ci_failure`    : Check/CI failed on a PR authored by the user.
 *   - `mention`       : The user was @-mentioned in an issue/PR comment.
 *   - `pr_comment`    : A real human commented/reviewed on a PR authored by the user.
 *   - `review_request`: Someone requested the user as a reviewer (opt-in).
 *
 * Everything else (stars, watched-repo noise, Dependabot chatter, team mentions
 * on repos the user doesn't own, bot comments on their PRs, etc.) is dropped.
 */

/** Heuristic for "is this login a bot we should ignore". */
export function isBotLogin(user, extraBotLogins = []) {
  if (!user) return false;
  if (user.type === 'Bot') return true;
  const login = (user.login || '').toLowerCase();
  if (!login) return false;
  if (login.endsWith('[bot]')) return true;
  if (login === 'github-actions' || login === 'dependabot') return true;
  return extraBotLogins.map(s => s.toLowerCase()).includes(login);
}

function parseRepoFullName(fullName) {
  const [owner, repo] = (fullName || '').split('/');
  return { owner, repo };
}

function extractPullNumberFromSubjectUrl(url) {
  // e.g. https://api.github.com/repos/o/r/pulls/123
  const m = /\/pulls\/(\d+)(?:$|\/|\?)/.exec(url || '');
  return m ? Number(m[1]) : null;
}

function extractIssueNumberFromSubjectUrl(url) {
  const m = /\/issues\/(\d+)(?:$|\/|\?)/.exec(url || '');
  return m ? Number(m[1]) : null;
}

function webUrlFromApiUrl(apiUrl) {
  if (!apiUrl) return null;
  // Translate api.github.com/repos/o/r/(pulls|issues)/N -> github.com/o/r/(pull|issues)/N
  return apiUrl
    .replace('https://api.github.com/repos/', 'https://github.com/')
    .replace('/pulls/', '/pull/');
}

function alertId(parts) {
  return createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);
}

function containsMention(body, login) {
  if (!body || !login) return false;
  const re = new RegExp(`(^|[^A-Za-z0-9_/-])@${login}\\b`, 'i');
  return re.test(body);
}

/**
 * @param {Object} args
 * @param {GitHubClient} args.client
 * @param {Object}       args.user           - authenticated user { login, id, ... }
 * @param {Array}        args.notifications  - GitHub notification threads
 * @param {string[]}     args.extraBotLogins
 * @param {boolean}      args.includeReviewRequests
 * @param {string}       args.since          - ISO timestamp; only consider events at/after
 * @returns {Promise<Alert[]>}
 */
export async function buildAlerts({
  client,
  user,
  notifications,
  extraBotLogins = [],
  includeReviewRequests = true,
  since,
}) {
  const alerts = [];

  for (const n of notifications) {
    try {
      const perNotification = await alertsForNotification({
        client,
        user,
        notification: n,
        extraBotLogins,
        includeReviewRequests,
        since,
      });
      alerts.push(...perNotification);
    } catch (err) {
      // Don't let one bad notification poison the stream.
      // Surface as a low-severity debug alert so we can see it in verbose mode.
      alerts.push({
        id: alertId(['error', n.id || '', String(Date.now())]),
        type: 'debug',
        severity: 'low',
        title: `Failed to process notification ${n.id}`,
        body: String(err && err.message ? err.message : err),
        url: n.subject?.url || null,
        threadId: n.id,
        createdAt: n.updated_at || new Date().toISOString(),
        repo: n.repository?.full_name || null,
      });
    }
  }

  return dedupeAlerts(alerts);
}

async function alertsForNotification({
  client,
  user,
  notification,
  extraBotLogins,
  includeReviewRequests,
  since,
}) {
  const reason = notification.reason; // mention, team_mention, review_requested, author, comment, ci_activity, ...
  const subject = notification.subject || {};
  const subjectType = subject.type; // Issue, PullRequest, CheckSuite, Commit, Release, Discussion
  const repoFullName = notification.repository?.full_name;
  const { owner, repo } = parseRepoFullName(repoFullName);
  if (!owner || !repo) return [];

  const out = [];

  // ─── Review requests (opt-in) ─────────────────────────────────────────────
  if (reason === 'review_requested' && includeReviewRequests) {
    if (subjectType === 'PullRequest') {
      const pr = await client.getSubject(subject.url).catch(() => null);
      if (pr) {
        out.push({
          id: alertId(['review_request', repoFullName, pr.number]),
          type: 'review_request',
          severity: 'medium',
          title: `Review requested: ${repoFullName}#${pr.number} — ${pr.title}`,
          body: `by @${pr.user?.login || 'unknown'}`,
          url: pr.html_url,
          threadId: notification.id,
          createdAt: notification.updated_at,
          repo: repoFullName,
        });
      }
    }
    return out;
  }

  // ─── PullRequest-subject notifications ────────────────────────────────────
  if (subjectType === 'PullRequest') {
    const prNumber = extractPullNumberFromSubjectUrl(subject.url);
    if (!prNumber) return [];

    const pr = await client.getSubject(subject.url).catch(() => null);
    if (!pr) return [];

    const isMine = pr.user?.id === user.id;

    // CI failure signal (GitHub surfaces this via reason === 'ci_activity').
    // We handle CheckSuite subject separately below; here we cover PRs where
    // GitHub dropped the check info straight onto the PR thread.
    if (reason === 'ci_activity' && isMine) {
      const failing = await findFailingChecks(client, { owner, repo, sha: pr.head?.sha });
      if (failing.length) {
        out.push(buildCiFailureAlert({ pr, failing, repoFullName, notification }));
      }
      return out;
    }

    // Direct @mention of the user in a PR (comment or body).
    if (reason === 'mention' || reason === 'team_mention') {
      const hits = await findMentionHits({
        client,
        owner,
        repo,
        number: prNumber,
        user,
        since,
      });
      for (const hit of hits) {
        out.push({
          id: alertId(['mention', repoFullName, prNumber, hit.id]),
          type: 'mention',
          severity: 'high',
          title: `@${hit.author} mentioned you in ${repoFullName}#${prNumber}`,
          body: truncate(hit.body, 500),
          url: hit.html_url || pr.html_url,
          threadId: notification.id,
          createdAt: hit.created_at || notification.updated_at,
          repo: repoFullName,
        });
      }
      return out;
    }

    // Comments on PRs authored by the user, from real humans (not the user).
    if (isMine && (reason === 'author' || reason === 'comment' || reason === 'subscribed')) {
      const hits = await findHumanPrComments({
        client,
        owner,
        repo,
        number: prNumber,
        user,
        extraBotLogins,
        since,
      });
      for (const hit of hits) {
        out.push({
          id: alertId([hit.kind, repoFullName, prNumber, hit.id]),
          type: 'pr_comment',
          severity: 'medium',
          title:
            hit.kind === 'review'
              ? `Review from @${hit.author} on ${repoFullName}#${prNumber} (${hit.state})`
              : `Comment from @${hit.author} on ${repoFullName}#${prNumber}`,
          body: truncate(hit.body, 500),
          url: hit.html_url || pr.html_url,
          threadId: notification.id,
          createdAt: hit.created_at || notification.updated_at,
          repo: repoFullName,
        });
      }
      return out;
    }

    return out;
  }

  // ─── Issue-subject notifications ──────────────────────────────────────────
  if (subjectType === 'Issue' && (reason === 'mention' || reason === 'team_mention')) {
    const issueNumber = extractIssueNumberFromSubjectUrl(subject.url);
    if (!issueNumber) return [];
    const hits = await findMentionHits({
      client,
      owner,
      repo,
      number: issueNumber,
      user,
      since,
      isIssue: true,
    });
    for (const hit of hits) {
      out.push({
        id: alertId(['mention', repoFullName, issueNumber, hit.id]),
        type: 'mention',
        severity: 'high',
        title: `@${hit.author} mentioned you in ${repoFullName}#${issueNumber}`,
        body: truncate(hit.body, 500),
        url: hit.html_url || webUrlFromApiUrl(subject.url),
        threadId: notification.id,
        createdAt: hit.created_at || notification.updated_at,
        repo: repoFullName,
      });
    }
    return out;
  }

  // ─── CheckSuite / Commit subjects (CI failures) ───────────────────────────
  if ((subjectType === 'CheckSuite' || subjectType === 'Commit') && reason === 'ci_activity') {
    // Try to resolve back to a PR owned by the user via the head SHA.
    const pr = await findOwningPullRequest({
      client,
      owner,
      repo,
      subject,
      notification,
    });
    if (!pr || pr.user?.id !== user.id) return [];

    const failing = await findFailingChecks(client, {
      owner,
      repo,
      sha: pr.head?.sha,
    });
    if (!failing.length) return out;
    out.push(buildCiFailureAlert({ pr, failing, repoFullName, notification }));
    return out;
  }

  return out;
}

function buildCiFailureAlert({ pr, failing, repoFullName, notification }) {
  const titleParts = failing
    .slice(0, 3)
    .map(c => c.name)
    .join(', ');
  const extra = failing.length > 3 ? ` (+${failing.length - 3} more)` : '';
  return {
    id: alertId([
      'ci_failure',
      repoFullName,
      pr.number,
      pr.head?.sha || '',
      failing.map(c => c.name).join(','),
    ]),
    type: 'ci_failure',
    severity: 'high',
    title: `CI failing on ${repoFullName}#${pr.number}: ${titleParts}${extra}`,
    body: failing
      .slice(0, 10)
      .map(c => `- ${c.name}${c.details_url ? ` → ${c.details_url}` : ''}`)
      .join('\n'),
    url: pr.html_url,
    threadId: notification.id,
    createdAt: notification.updated_at,
    repo: repoFullName,
  };
}

async function findFailingChecks(client, { owner, repo, sha }) {
  if (!sha) return [];
  const results = [];

  const runs = await client.listCheckRuns({ owner, repo, ref: sha }).catch(() => []);
  for (const r of runs) {
    if (r.status === 'completed' && ['failure', 'timed_out', 'action_required'].includes(r.conclusion)) {
      results.push({
        name: r.name,
        details_url: r.html_url || r.details_url,
        conclusion: r.conclusion,
      });
    }
  }

  // Also include legacy statuses so we don't miss Buildkite, CircleCI, etc.
  const combined = await client.getCombinedStatus({ owner, repo, ref: sha }).catch(() => null);
  if (combined?.statuses) {
    for (const s of combined.statuses) {
      if (s.state === 'failure' || s.state === 'error') {
        results.push({
          name: s.context,
          details_url: s.target_url,
          conclusion: s.state,
        });
      }
    }
  }

  // De-dupe by name (some checks appear in both lists).
  const seen = new Set();
  return results.filter(r => (seen.has(r.name) ? false : (seen.add(r.name), true)));
}

async function findOwningPullRequest({ client, owner, repo, subject, notification }) {
  // CheckSuite notifications don't link directly to PRs; the subject URL points
  // at /check-suites/:id which doesn't expose the PR cheaply. Fall back: look
  // for PRs touched in this thread via the notification's latest_comment_url
  // or skip. We only care about the user's own PRs; listing open PRs for the
  // viewer is still cheaper than a check-suite lookup in most cases.
  if (notification.subject?.latest_comment_url) {
    const target = await client
      .getSubject(notification.subject.latest_comment_url)
      .catch(() => null);
    if (target?.pull_request) {
      const pr = await client.getSubject(target.pull_request.url).catch(() => null);
      if (pr) return pr;
    }
  }
  return null;
}

async function findMentionHits({
  client,
  owner,
  repo,
  number,
  user,
  since,
  isIssue = false,
}) {
  const hits = [];
  const issueComments = await client
    .listIssueComments({ owner, repo, number, since })
    .catch(() => []);
  for (const c of issueComments) {
    if (c.user?.id === user.id) continue;
    if (containsMention(c.body, user.login)) {
      hits.push({
        id: `issue-comment-${c.id}`,
        author: c.user?.login || 'unknown',
        body: c.body,
        html_url: c.html_url,
        created_at: c.created_at,
      });
    }
  }

  if (!isIssue) {
    const reviewComments = await client
      .listPullReviewComments({ owner, repo, number, since })
      .catch(() => []);
    for (const c of reviewComments) {
      if (c.user?.id === user.id) continue;
      if (containsMention(c.body, user.login)) {
        hits.push({
          id: `review-comment-${c.id}`,
          author: c.user?.login || 'unknown',
          body: c.body,
          html_url: c.html_url,
          created_at: c.created_at,
        });
      }
    }
  }

  return hits;
}

async function findHumanPrComments({
  client,
  owner,
  repo,
  number,
  user,
  extraBotLogins,
  since,
}) {
  const hits = [];

  const issueComments = await client
    .listIssueComments({ owner, repo, number, since })
    .catch(() => []);
  for (const c of issueComments) {
    if (!c.user) continue;
    if (c.user.id === user.id) continue;
    if (isBotLogin(c.user, extraBotLogins)) continue;
    hits.push({
      kind: 'comment',
      id: `issue-comment-${c.id}`,
      author: c.user.login,
      body: c.body,
      html_url: c.html_url,
      created_at: c.created_at,
    });
  }

  const reviewComments = await client
    .listPullReviewComments({ owner, repo, number, since })
    .catch(() => []);
  for (const c of reviewComments) {
    if (!c.user) continue;
    if (c.user.id === user.id) continue;
    if (isBotLogin(c.user, extraBotLogins)) continue;
    hits.push({
      kind: 'review_comment',
      id: `review-comment-${c.id}`,
      author: c.user.login,
      body: c.body,
      html_url: c.html_url,
      created_at: c.created_at,
    });
  }

  const reviews = await client
    .listPullReviews({ owner, repo, number })
    .catch(() => []);
  for (const r of reviews) {
    if (!r.user) continue;
    if (r.user.id === user.id) continue;
    if (isBotLogin(r.user, extraBotLogins)) continue;
    if (!r.submitted_at) continue;
    if (since && r.submitted_at < since) continue;
    hits.push({
      kind: 'review',
      id: `review-${r.id}`,
      author: r.user.login,
      body: r.body || `(${r.state})`,
      state: r.state,
      html_url: r.html_url,
      created_at: r.submitted_at,
    });
  }

  return hits;
}

function dedupeAlerts(alerts) {
  const seen = new Set();
  const out = [];
  for (const a of alerts) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
  }
  return out;
}

function truncate(s, max) {
  if (!s) return '';
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}
