// Ours
const Now = require('../lib');

module.exports = class DomainRecords extends Now {
  async getRecord(id) {
    const all = (await this.ls()).entries();
    for (const [domain, records] of all) {
      for (const record of records) {
        if (record.id === id) {
          record.domain = domain;
          return record;
        }
      }
    }
    return null;
  }

  async ls(dom) {
    let domains;

    if (dom) {
      domains = [dom];
    } else {
      const ret = await this.listDomains();
      domains = ret
        .filter(x => !x.isExternal)
        .map(x => x.name)
        .sort((a, b) => a.localeCompare(b));
    }

    const records = new Map();
    const bodies = [];

    for (const domain of domains) {
      bodies.push(
        this.retry(async (bail, attempt) => {
          const url = `/domains/${domain}/records`;
          if (this._debug) {
            console.time(`> [debug] #${attempt} GET ${url}`);
          }
          const res = await this._fetch(url);
          if (this._debug) {
            console.timeEnd(`> [debug] #${attempt} GET ${url}`);
          }
          const body = await res.json();

          if (res.status === 404 && body.code === 'not_found') {
            return bail(new Error(body.message));
          } else if (res.status !== 200) {
            throw new Error(`Failed to get DNS records for domain "${domain}"`);
          }

          return body;
        })
      );
    }

    const domainList = await Promise.all(bodies);

    for (const body of domainList) {
      const index = domainList.indexOf(body);

      records.set(
        domains[index],
        body.records.sort((a, b) => a.slug.localeCompare(b.slug))
      );
    }

    return records;
  }

  create(domain, data) {
    const url = `/domains/${domain}/records`;

    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] #${attempt} POST ${url}`);
      }
      const res = await this._fetch(url, {
        method: 'POST',
        body: data
      });
      if (this._debug) {
        console.timeEnd(`> [debug] #${attempt} POST ${url}`);
      }

      const body = await res.json();
      if (res.status === 400) {
        return bail(
          new Error(body.error ? body.error.message : 'Unknown error')
        );
      } else if (res.status === 403) {
        const err = new Error(
          `Not authorized to access the domain "${domain}"`
        );
        err.userError = true;
        return bail(err);
      } else if (res.status === 404) {
        let err;

        if (body.error.code === 'not_found') {
          err = new Error(`The domain "${domain}" was not found`);
          err.userError = true;
          return bail(err);
        }
      }

      if (res.status !== 200) {
        throw new Error(body.error ? body.error.message : 'Unknown error');
      }

      return body;
    });
  }

  delete(domain, recordId) {
    const url = `/domains/${domain}/records/${recordId}`;

    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] #${attempt} DELETE ${url}`);
      }
      const res = await this._fetch(url, { method: 'DELETE' });
      if (this._debug) {
        console.timeEnd(`> [debug] #${attempt} DELETE ${url}`);
      }

      const body = await res.json();
      if (res.status === 403) {
        const err = new Error(`Not authorized to access domain ${domain}`);
        err.userError = true;
        return bail(err);
      } else if (res.status === 404) {
        let err;

        if (body.error.code === 'not_found') {
          err = new Error(body.error.message);
          err.userError = true;
          return bail(err);
        }
      }

      if (res.status !== 200) {
        throw new Error(body.error ? body.error.message : 'Unkown error');
      }

      return body;
    });
  }
};
