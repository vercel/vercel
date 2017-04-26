const Now = require('../lib');

module.exports = class Teams extends Now {
  async create({ slug }) {
    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] #${attempt} POST /teams}`);
      }

      const res = await this._fetch(`/teams`, {
        method: 'POST',
        body: {
          slug
        }
      });

      if (this._debug) {
        console.timeEnd(`> [debug] #${attempt} POST /teams`);
      }

      if (res.status === 403) {
        return bail(new Error('Unauthorized'));
      }

      const body = await res.json();


      if (res.status === 400) {
        const e = new Error(body.error.message)
        e.code = body.error.code
        return bail(e)
      } else if (res.status !== 200) {
        const e = new Error(body.error.message)
        e.code = body.error.code
        throw e
      }

      return body
    });
  }

  async setName({ /* id, slug, */ name }) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          id: 'tea_uh312brpf01',
          name
          // Error: {message: 'Some weird error'}
        });
      }, 500);
    });
  }

  async inviteUser(/* {teamId, teamSlug, email} */) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve();
      }, 500);
    });
  }

  async ls() {
    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] #${attempt} GET /teams}`);
      }

      const res = await this._fetch(`/teams`);

      if (this._debug) {
        console.timeEnd(`> [debug] #${attempt} GET /teams`);
      }

      if (res.status === 403) {
        return bail(new Error('Unauthorized'));
      }

      return res.json();
    });
  }
};
