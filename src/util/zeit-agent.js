import {parse as parseUrl} from 'url';
import qs from 'querystring';
import Agent from './agent';

export default class ZeitAgent extends Agent {
  constructor(url, options) {
    super(url, options);
    this.token = options.token;
    this.teamId = options.teamId;
  }

  fetch(path, opts={}) {
    opts.headers = opts.headers || {};
    if (!opts.headers.Authorization) {
      opts.headers.Authorization = `bearer ${this.token}`;
    }

    if (this.teamId) {
      const {query} = parseUrl(path, true);
      query.teamId = this.teamId;
      path = `${path}?${qs.stringify(query)}`;
    }

    return super.fetch(path, opts);
  }

  async fetchAndThrow(path, opts) {
    const res = await this.fetch(path, opts);

    // Success. Let's get the JSON
    if (res.status === 200) {
      return res.json();
    }

    // This is still a success code
    if (Math.round(res.status / 100) === 2) {
      return null;
    }

    // This should be an error. Let's throw it.
    const message = await res.text();
    throw new Error(message);
  }
}
