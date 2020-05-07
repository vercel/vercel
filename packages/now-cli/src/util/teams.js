import Now from './index';
import { URLSearchParams } from 'url';

export default class Teams extends Now {
  async create({ slug }) {
    return this.retry(async bail => {
      const res = await this._fetch(`/teams`, {
        method: 'POST',
        body: {
          slug,
        },
      });

      if (res.status === 403) {
        return bail(new Error('Unauthorized'));
      }

      const body = await res.json();

      if (res.status === 400) {
        const e = new Error(body.error.message);
        e.code = body.error.code;
        return bail(e);
      }
      if (res.status !== 200) {
        const e = new Error(body.error.message);
        e.code = body.error.code;
        throw e;
      }

      return body;
    });
  }

  async edit({ id, slug, name }) {
    return this.retry(async bail => {
      const payload = {};
      if (name) {
        payload.name = name;
      }
      if (slug) {
        payload.slug = slug;
      }

      const res = await this._fetch(`/teams/${id}`, {
        method: 'PATCH',
        body: payload,
      });

      if (res.status === 403) {
        return bail(new Error('Unauthorized'));
      }

      const body = await res.json();

      if (res.status === 400) {
        const e = new Error(body.error.message);
        e.code = body.error.code;
        return bail(e);
      }
      if (res.status !== 200) {
        const e = new Error(body.error.message);
        e.code = body.error.code;
        throw e;
      }

      return body;
    });
  }

  async inviteUser({ teamId, email }) {
    return this.retry(async bail => {
      const publicRes = await this._fetch(`/www/user/public?email=${email}`);
      const { name, username } = await publicRes.json();

      const res = await this._fetch(`/teams/${teamId}/members`, {
        method: 'POST',
        body: {
          email,
        },
      });

      if (res.status === 403) {
        return bail(new Error('Unauthorized'));
      }

      const body = await res.json();

      if (res.status === 400) {
        const e = new Error(body.error.message);
        e.code = body.error.code;
        return bail(e);
      }

      if (res.status !== 200) {
        const e = new Error(body.error.message);
        e.code = body.error.code;
        throw e;
      }

      return { ...body, name, username };
    });
  }

  async ls({ next, apiVersion = 1 } = {}) {
    return this.retry(async bail => {
      const query = new URLSearchParams();

      if (next) {
        query.set('limit', 20);
        query.set('until', next);
      }

      const res = await this._fetch(`/v${apiVersion}/teams?${query}`);

      if (res.status === 403) {
        const error = new Error('Unauthorized');
        error.code = 'not_authorized';
        return bail(error);
      }

      return res.json();
    });
  }
}
