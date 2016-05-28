import retry from 'async-retry';
import Now from '../lib';
import toHost from './to-host';

export default class Alias extends Now {

  async ls () {
    return retry(async (bail) => {
      const res = await this._fetch('/now/aliases');

      if (200 !== res.status && (400 <= res.status || 500 > res.status)) {
        if (this._debug) console.log('> [debug] bailing on creating due to %s', res.status);
        return bail(responseError(res));
      }

      return await res.json();
    }, { retries: 3, minTimeout: 2500, onRetry: this._onRetry });
  }

  async rm (url, aliases) {
    console.log('rm', url, aliases);
    const deploymentId = url; // TODO get from API
    return await Promise.all(aliases.map(async (alias) => {
      retry(async (bail) => {
        const res = await this._fetch(`/now/aliases/${deploymentId}/${alias}`, {
          method: 'DELETE'
        });

        if (200 !== res.status && (400 <= res.status || 500 > res.status)) {
          if (this._debug) console.log('> [debug] bailing on creating due to %s', res.status);
          return bail(responseError(res));
        }

        return await res.json();
      }, { retries: 3, minTimeout: 2500, onRetry: this._onRetry });
    }));
  }

  async set (deployment, alias) {
    const list = await this.list();
    let key, val;

    if (~deployment.indexOf('.')) {
      val = toHost(deployment);
      key = 'url';
    } else {
      val = deployment;
      key = 'uid';
    }

    const id = list.find((d) => d[key] === val);

    if (!id) {
      const err = new Error(`Deployment not found by ${key} "${deployment}"`);
      err.userError = true;
      throw err;
    }
  }

}

function responseError (res) {
  const err = new Error('Response error');
  err.status = res.status;

  if (429 === res.status) {
    const retryAfter = res.headers.get('Retry-After');
    if (retryAfter) {
      err.retryAfter = parseInt(retryAfter, 10);
    }
  }

  return err;
}
