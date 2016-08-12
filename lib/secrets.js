import Now from '../lib';

export default class Secrets extends Now {

  async ls () {
    return this.retry(async (bail, attempt) => {
      if (this._debug) console.time(`> [debug] #${attempt} GET /secrets`);
      const res = await this._fetch('/secrets');
      if (this._debug) console.timeEnd(`> [debug] #${attempt} GET /secrets`);
      const body = await res.json();
      return body.secrets;
    });
  }

  async rm (nameOrId) {
    return this.retry(async (bail, attempt) => {
      if (this._debug) console.time(`> [debug] #${attempt} DELETE /secrets/${nameOrId}`);
      const res = await this._fetch(`/secrets/${nameOrId}`, { method: 'DELETE' });
      if (this._debug) console.timeEnd(`> [debug] #${attempt} DELETE /secrets/${nameOrId}`);

      if (403 === res.status) {
        return bail(new Error('Unauthorized'));
      }

      if (res.status !== 200) {
        const body = await res.json();
        throw new Error(body.error.message);
      }
    });
  }

  async add (name, value) {

  }

}
