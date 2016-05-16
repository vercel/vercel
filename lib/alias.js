import EventEmitter from 'events';
import Agent from './agent';

export default class Now extends EventEmitter {
  constructor (url, token, { forceNew = false, debug = false }) {
    super();
    this._token = token;
    this._debug = debug;
    this._forceNew = forceNew;
    this._agent = new Agent(url, { debug });
    this._onRetry = this._onRetry.bind(this);
  }

  ls (url) {
    console.log('list', url);
  }

  rm (url, aliases) {
    console.log('rm', url, aliases);
  }

  set (url, aliases) {
    console.log('set', url, aliases);
  }

  _onRetry (err) {
    if (this._debug) {
      console.log(`> [debug] Retrying: ${err.stack}`);
    }
  }

  async _fetch (_url, opts = {}) {
    opts.headers = opts.headers || {};
    opts.headers.authorization = `Bearer ${this._token}`;
    return await this._agent.fetch(_url, opts);
  }
}
