const Sentry = require('@sentry/node');
const version = require('../../package.json').version;

const SENTRY_PUBLIC_DNS = 'https://ca2591e4758b4de3b1574838146893d0@sentry.io/1310242';

if (process.pkg) {
  Sentry.init({ dsn: SENTRY_PUBLIC_DNS, release: `now-cli@${version}` });
}

module.exports = Sentry;
