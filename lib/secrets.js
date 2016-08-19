import Now from '../lib';

export default class Secrets extends Now {

  ls () {
    return this.retry(async (bail, attempt) => {
      if (this._debug) console.time(`> [debug] #${attempt} GET /secrets`);
      const res = await this._fetch('/secrets');
      if (this._debug) console.timeEnd(`> [debug] #${attempt} GET /secrets`);
      const body = await res.json();
      return body.secrets;
    });
  }

  rm (nameOrId) {
    return this.retry(async (bail, attempt) => {
      if (this._debug) console.time(`> [debug] #${attempt} DELETE /secrets/${nameOrId}`);
      const res = await this._fetch(`/secrets/${nameOrId}`, { method: 'DELETE' });
      if (this._debug) console.timeEnd(`> [debug] #${attempt} DELETE /secrets/${nameOrId}`);

      if (403 === res.status) {
        return bail(new Error('Unauthorized'));
      }

      const body = await res.json();

      if (res.status !== 200) {
        if (404 === res.status || 400 === res.status) {
          const err = new Error(body.error.message);
          err.userError = true;
          return bail(err);
        } else {
          throw new Error(body.error.message);
        }
      }

      return body;
    });
  }

  add (name, value) {
    return this.retry(async (bail, attempt) => {
      if (this._debug) console.time(`> [debug] #${attempt} POST /secrets`);
      const res = await this._fetch('/secrets', {
        method: 'POST',
        body: {
          name,
          value
        }
      });
      if (this._debug) console.timeEnd(`> [debug] #${attempt} POST /secrets`);

      if (403 === res.status) {
        return bail(new Error('Unauthorized'));
      }

      const body = await res.json();

      if (res.status !== 200) {
        if (404 === res.status || 400 === res.status) {
          const err = new Error(body.error.message);
          err.userError = true;
          return bail(err);
        } else {
          throw new Error(body.error.message);
        }
      }

      return body;
    });
  }

  rename (nameOrId, newName) {
    return this.retry(async (bail, attempt) => {
      if (this._debug) console.time(`> [debug] #${attempt} PATCH /secrets/${nameOrId}`);
      const res = await this._fetch(`/secrets/${nameOrId}`, {
        method: 'PATCH',
        body: {
          name: newName
        }
      });
      if (this._debug) console.timeEnd(`> [debug] #${attempt} PATCH /secrets/${nameOrId}`);

      if (403 === res.status) {
        return bail(new Error('Unauthorized'));
      }

      const body = await res.json();

      if (res.status !== 200) {
        if (404 === res.status || 400 === res.status) {
          const err = new Error(body.error.message);
          err.userError = true;
          return bail(err);
        } else {
          throw new Error(body.error.message);
        }
      }

      return body;
    });
  }

}
