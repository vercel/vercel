/**
 * Minimal GitHub REST client using global fetch (Node 20+).
 *
 * Only the endpoints we need; keeps the tool dependency-free.
 */

const USER_AGENT = 'gh-notify-agent/0.1';

export class GitHubError extends Error {
  constructor(message, { status, url, body } = {}) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

export class GitHubClient {
  constructor({ token, apiBase = 'https://api.github.com' }) {
    if (!token) throw new Error('GitHubClient requires a token');
    this.token = token;
    this.apiBase = apiBase.replace(/\/$/, '');
  }

  async request(path, { method = 'GET', headers = {}, query, body, raw = false } = {}) {
    const url = new URL(path.startsWith('http') ? path : this.apiBase + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    const res = await fetch(url, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': USER_AGENT,
        Authorization: `Bearer ${this.token}`,
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 304) return { data: null, res };

    if (!res.ok) {
      let errBody;
      try {
        errBody = await res.text();
      } catch {
        errBody = '';
      }
      throw new GitHubError(
        `GitHub ${method} ${url.pathname} -> ${res.status} ${res.statusText}`,
        { status: res.status, url: url.toString(), body: errBody }
      );
    }

    if (raw) return { data: res, res };

    if (res.status === 204) return { data: null, res };
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    return { data, res };
  }

  /** GET /user */
  async getAuthenticatedUser() {
    const { data } = await this.request('/user');
    return data;
  }

  /**
   * GET /notifications
   * Returns unread notifications for the authenticated user.
   */
  async listNotifications({ since, participating = false, all = false } = {}) {
    const { data } = await this.request('/notifications', {
      query: {
        participating: participating ? 'true' : 'false',
        all: all ? 'true' : 'false',
        since,
        per_page: 50,
      },
    });
    return data || [];
  }

  /** PATCH /notifications/threads/:thread_id -> mark a single thread as read. */
  async markThreadRead(threadId) {
    await this.request(`/notifications/threads/${threadId}`, { method: 'PATCH' });
  }

  /** Fetch the subject referenced by a notification (Issue, PR, Commit, etc.). */
  async getSubject(url) {
    const { data } = await this.request(url);
    return data;
  }

  /** GET /repos/:owner/:repo/commits/:ref/check-runs */
  async listCheckRuns({ owner, repo, ref }) {
    const { data } = await this.request(
      `/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}/check-runs`,
      { query: { per_page: 100 } }
    );
    return data?.check_runs || [];
  }

  /** GET /repos/:owner/:repo/commits/:ref/status (legacy statuses) */
  async getCombinedStatus({ owner, repo, ref }) {
    const { data } = await this.request(
      `/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}/status`
    );
    return data;
  }

  /** GET /repos/:owner/:repo/issues/:number/comments (issue-level PR comments) */
  async listIssueComments({ owner, repo, number, since }) {
    const { data } = await this.request(
      `/repos/${owner}/${repo}/issues/${number}/comments`,
      { query: { since, per_page: 100 } }
    );
    return data || [];
  }

  /** GET /repos/:owner/:repo/pulls/:number/comments (review comments) */
  async listPullReviewComments({ owner, repo, number, since }) {
    const { data } = await this.request(
      `/repos/${owner}/${repo}/pulls/${number}/comments`,
      { query: { since, per_page: 100 } }
    );
    return data || [];
  }

  /** GET /repos/:owner/:repo/pulls/:number/reviews */
  async listPullReviews({ owner, repo, number }) {
    const { data } = await this.request(
      `/repos/${owner}/${repo}/pulls/${number}/reviews`,
      { query: { per_page: 100 } }
    );
    return data || [];
  }
}
