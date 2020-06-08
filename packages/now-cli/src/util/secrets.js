import Now from './now';
import { responseError } from './error';

export default class Secrets extends Now {
  async ls() {
    const { secrets } = await this.retry(async bail => {
      const res = await this._fetch('/now/secrets');

      if (res.status === 200) {
        // What we want
        return res.json();
      }
      if (res.status > 200 && res.status < 500) {
        // If something is wrong with our request, we don't retry
        return bail(await responseError(res, 'Failed to list secrets'));
      }
      // If something is wrong with the server, we retry
      throw await responseError(res, 'Failed to list secrets');
    });

    return secrets;
  }

  async getSecretByNameOrId(nameOrId) {
    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] #${attempt} GET /secrets/${nameOrId}`);
      }
      const res = await this._fetch(`/now/secrets/${nameOrId}`, {
        method: 'GET',
      });

      if (this._debug) {
        console.timeEnd(`> [debug] #${attempt} GET /secrets/${nameOrId}`);
      }

      if (res.status === 403) {
        return bail(new Error('Unauthorized'));
      }

      if (res.status === 404) {
        return bail(new Error('Not Found'));
      }

      if (res.status === 400) {
        return bail(new Error('Bad Request'));
      }

      const body = await res.json();

      if (res.status !== 200) {
        throw new Error(body.error.message);
      }

      return body;
    });
  }

  async rm(nameOrId) {
    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] #${attempt} DELETE /secrets/${nameOrId}`);
      }

      const res = await this._fetch(`/now/secrets/${nameOrId}`, {
        method: 'DELETE',
      });

      if (this._debug) {
        console.timeEnd(`> [debug] #${attempt} DELETE /secrets/${nameOrId}`);
      }

      if (res.status === 403) {
        return bail(new Error('Unauthorized'));
      }

      const body = await res.json();

      if (res.status !== 200) {
        throw new Error(body.error.message);
      }

      return body;
    });
  }

  async add(name, value) {
    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] #${attempt} POST /secrets`);
      }

      const res = await this._fetch('/now/secrets', {
        method: 'POST',
        body: {
          name,
          value: value.toString(),
        },
      });

      if (this._debug) {
        console.timeEnd(`> [debug] #${attempt} POST /secrets`);
      }

      if (res.status === 403) {
        return bail(new Error('Unauthorized'));
      }

      const body = await res.json();

      if (res.status !== 200) {
        throw new Error(body.error.message);
      }

      return body;
    });
  }

  async rename(nameOrId, newName) {
    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] #${attempt} PATCH /secrets/${nameOrId}`);
      }

      const res = await this._fetch(`/now/secrets/${nameOrId}`, {
        method: 'PATCH',
        body: {
          name: newName,
        },
      });

      if (this._debug) {
        console.timeEnd(`> [debug] #${attempt} PATCH /secrets/${nameOrId}`);
      }

      if (res.status === 403) {
        return bail(new Error('Unauthorized'));
      }

      const body = await res.json();

      if (res.status !== 200) {
        throw new Error(body.error.message);
      }

      return body;
    });
  }
}
