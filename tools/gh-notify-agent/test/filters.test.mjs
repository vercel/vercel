import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAlerts, isBotLogin } from '../src/filters.mjs';

const USER = { id: 100, login: 'alice', type: 'User' };
const BOT = { id: 200, login: 'dependabot[bot]', type: 'Bot' };
const OTHER = { id: 300, login: 'bob', type: 'User' };

function makeClient(overrides = {}) {
  return {
    async getSubject(url) {
      if (overrides.subjects && overrides.subjects[url]) return overrides.subjects[url];
      throw new Error(`unexpected getSubject ${url}`);
    },
    async listCheckRuns() {
      return overrides.checkRuns || [];
    },
    async getCombinedStatus() {
      return overrides.combinedStatus || { statuses: [] };
    },
    async listIssueComments() {
      return overrides.issueComments || [];
    },
    async listPullReviewComments() {
      return overrides.reviewComments || [];
    },
    async listPullReviews() {
      return overrides.reviews || [];
    },
  };
}

describe('isBotLogin', () => {
  it('flags type=Bot', () => {
    assert.equal(isBotLogin({ type: 'Bot', login: 'x' }), true);
  });
  it('flags [bot] suffix', () => {
    assert.equal(isBotLogin({ type: 'User', login: 'renovate[bot]' }), true);
  });
  it('flags known bot logins', () => {
    assert.equal(isBotLogin({ type: 'User', login: 'dependabot' }), true);
    assert.equal(isBotLogin({ type: 'User', login: 'github-actions' }), true);
  });
  it('honors extraBotLogins', () => {
    assert.equal(
      isBotLogin({ type: 'User', login: 'codecov' }, ['codecov']),
      true
    );
  });
  it('does not flag real users', () => {
    assert.equal(isBotLogin({ type: 'User', login: 'alice' }), false);
  });
});

describe('buildAlerts - mention', () => {
  it('emits a mention alert when body contains @user', async () => {
    const notification = {
      id: 'n1',
      reason: 'mention',
      updated_at: '2026-05-01T10:00:00Z',
      repository: { full_name: 'org/repo' },
      subject: {
        type: 'PullRequest',
        url: 'https://api.github.com/repos/org/repo/pulls/1',
      },
    };
    const pr = {
      number: 1,
      title: 'Do thing',
      user: OTHER,
      html_url: 'https://github.com/org/repo/pull/1',
      head: { sha: 'abc' },
    };
    const client = makeClient({
      subjects: { [notification.subject.url]: pr },
      issueComments: [
        {
          id: 9001,
          user: OTHER,
          body: 'hey @alice please take a look',
          html_url: 'https://github.com/org/repo/pull/1#issuecomment-9001',
          created_at: '2026-05-01T09:59:00Z',
        },
        {
          id: 9002,
          user: OTHER,
          body: 'ignore me, no mention here',
          created_at: '2026-05-01T09:58:00Z',
        },
      ],
    });
    const alerts = await buildAlerts({
      client,
      user: USER,
      notifications: [notification],
      since: '2026-04-30T00:00:00Z',
    });
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].type, 'mention');
    assert.match(alerts[0].title, /@bob mentioned you in org\/repo#1/);
  });

  it('ignores @-substring in email-like or @teamname strings', async () => {
    const notification = {
      id: 'n1',
      reason: 'mention',
      updated_at: '2026-05-01T10:00:00Z',
      repository: { full_name: 'org/repo' },
      subject: {
        type: 'PullRequest',
        url: 'https://api.github.com/repos/org/repo/pulls/1',
      },
    };
    const pr = { number: 1, title: 't', user: OTHER, html_url: 'x', head: { sha: 'abc' } };
    const client = makeClient({
      subjects: { [notification.subject.url]: pr },
      issueComments: [
        { id: 1, user: OTHER, body: 'email alice@example.com', created_at: '2026-05-01' },
        { id: 2, user: OTHER, body: 'ping @alicefoo', created_at: '2026-05-01' },
      ],
    });
    const alerts = await buildAlerts({ client, user: USER, notifications: [notification] });
    assert.equal(alerts.length, 0);
  });
});

describe('buildAlerts - pr_comment', () => {
  it('emits pr_comment for human comments on the user\'s PR, skipping bots + self', async () => {
    const notification = {
      id: 'n2',
      reason: 'author',
      updated_at: '2026-05-01T10:00:00Z',
      repository: { full_name: 'org/repo' },
      subject: {
        type: 'PullRequest',
        url: 'https://api.github.com/repos/org/repo/pulls/42',
      },
    };
    const pr = {
      number: 42,
      title: 'Fix bug',
      user: USER,
      html_url: 'https://github.com/org/repo/pull/42',
      head: { sha: 'head42' },
    };
    const client = makeClient({
      subjects: { [notification.subject.url]: pr },
      issueComments: [
        { id: 1, user: OTHER, body: 'nice fix', html_url: 'h1', created_at: '2026-05-01T09:00:00Z' },
        { id: 2, user: BOT, body: 'beep boop', html_url: 'h2', created_at: '2026-05-01T09:00:00Z' },
        { id: 3, user: USER, body: 'self reply', html_url: 'h3', created_at: '2026-05-01T09:00:00Z' },
      ],
      reviews: [
        {
          id: 77,
          user: OTHER,
          state: 'CHANGES_REQUESTED',
          body: 'please fix',
          html_url: 'h-review',
          submitted_at: '2026-05-01T09:30:00Z',
        },
      ],
    });
    const alerts = await buildAlerts({ client, user: USER, notifications: [notification] });
    const kinds = alerts.map(a => a.type).sort();
    assert.deepEqual(kinds, ['pr_comment', 'pr_comment']);
    const titles = alerts.map(a => a.title).join('\n');
    assert.match(titles, /@bob/);
    assert.doesNotMatch(titles, /dependabot/);
    assert.doesNotMatch(titles, /@alice/);
  });

  it('does not emit pr_comment when the PR is not authored by the user', async () => {
    const notification = {
      id: 'n2',
      reason: 'subscribed',
      updated_at: '2026-05-01T10:00:00Z',
      repository: { full_name: 'org/repo' },
      subject: {
        type: 'PullRequest',
        url: 'https://api.github.com/repos/org/repo/pulls/43',
      },
    };
    const pr = { number: 43, title: 't', user: OTHER, html_url: 'x', head: { sha: 'h' } };
    const client = makeClient({
      subjects: { [notification.subject.url]: pr },
      issueComments: [{ id: 1, user: OTHER, body: 'hi', created_at: 'x' }],
    });
    const alerts = await buildAlerts({ client, user: USER, notifications: [notification] });
    assert.equal(alerts.length, 0);
  });
});

describe('buildAlerts - ci_failure', () => {
  it('emits ci_failure when ci_activity fires and check runs have failures', async () => {
    const notification = {
      id: 'n3',
      reason: 'ci_activity',
      updated_at: '2026-05-01T10:00:00Z',
      repository: { full_name: 'org/repo' },
      subject: {
        type: 'PullRequest',
        url: 'https://api.github.com/repos/org/repo/pulls/7',
      },
    };
    const pr = {
      number: 7,
      title: 'wip',
      user: USER,
      html_url: 'https://github.com/org/repo/pull/7',
      head: { sha: 'deadbeef' },
    };
    const client = makeClient({
      subjects: { [notification.subject.url]: pr },
      checkRuns: [
        { name: 'test', status: 'completed', conclusion: 'success' },
        {
          name: 'lint',
          status: 'completed',
          conclusion: 'failure',
          html_url: 'https://github.com/org/repo/actions/runs/1',
        },
      ],
      combinedStatus: {
        statuses: [{ context: 'buildkite', state: 'error', target_url: 'https://bk' }],
      },
    });
    const alerts = await buildAlerts({ client, user: USER, notifications: [notification] });
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].type, 'ci_failure');
    assert.match(alerts[0].title, /CI failing on org\/repo#7/);
    assert.match(alerts[0].body, /lint/);
    assert.match(alerts[0].body, /buildkite/);
  });

  it('does not emit ci_failure for PRs not authored by the user', async () => {
    const notification = {
      id: 'n3',
      reason: 'ci_activity',
      updated_at: '2026-05-01T10:00:00Z',
      repository: { full_name: 'org/repo' },
      subject: {
        type: 'PullRequest',
        url: 'https://api.github.com/repos/org/repo/pulls/8',
      },
    };
    const pr = { number: 8, title: 't', user: OTHER, html_url: 'x', head: { sha: 'h' } };
    const client = makeClient({
      subjects: { [notification.subject.url]: pr },
      checkRuns: [{ name: 'lint', status: 'completed', conclusion: 'failure' }],
    });
    const alerts = await buildAlerts({ client, user: USER, notifications: [notification] });
    assert.equal(alerts.length, 0);
  });
});

describe('buildAlerts - review_request', () => {
  it('emits review_request when includeReviewRequests is true', async () => {
    const notification = {
      id: 'n4',
      reason: 'review_requested',
      updated_at: '2026-05-01T10:00:00Z',
      repository: { full_name: 'org/repo' },
      subject: {
        type: 'PullRequest',
        url: 'https://api.github.com/repos/org/repo/pulls/99',
      },
    };
    const pr = {
      number: 99,
      title: 'pls review',
      user: OTHER,
      html_url: 'https://github.com/org/repo/pull/99',
    };
    const client = makeClient({ subjects: { [notification.subject.url]: pr } });
    const alerts = await buildAlerts({
      client,
      user: USER,
      notifications: [notification],
      includeReviewRequests: true,
    });
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].type, 'review_request');
  });

  it('suppresses review_request when includeReviewRequests is false', async () => {
    const notification = {
      id: 'n4',
      reason: 'review_requested',
      updated_at: '2026-05-01T10:00:00Z',
      repository: { full_name: 'org/repo' },
      subject: {
        type: 'PullRequest',
        url: 'https://api.github.com/repos/org/repo/pulls/99',
      },
    };
    const client = makeClient();
    const alerts = await buildAlerts({
      client,
      user: USER,
      notifications: [notification],
      includeReviewRequests: false,
    });
    assert.equal(alerts.length, 0);
  });
});
