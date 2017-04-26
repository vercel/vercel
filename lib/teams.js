const Now = require('../lib');

module.exports = class Teams extends Now {
  async add({ slug }) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          id: 'tea_uh312brpf01',
          slug
          // Error: {message: 'Team URL already in use'}
        });
      }, 500);
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
