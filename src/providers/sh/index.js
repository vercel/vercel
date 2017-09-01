module.exports = {
  title: 'now.sh',
  subcommands: new Set([
    'login',
    'deploy',
    'ls',
    'list',
    'alias',
    'scale',
    'certs',
    'dns',
    'domains',
    'rm',
    'remove',
    'whoami',
    'secrets',
    'logs',
    'upgrade',
    'teams',
    'switch'
  ]),
  get deploy() {
    return require('./deploy')
  },
  get login() {
    return require('./login')
  },
  get ls() {
    return require('./commands/bin/list')
  },
  get list() {
    return require('./commands/bin/list')
  },
  get alias() {
    return require('./commands/bin/alias')
  },
  get scale() {
    return require('./commands/bin/scale')
  },
  get certs() {
    return require('./commands/bin/certs')
  },
  get dns() {
    return require('./commands/bin/dns')
  },
  get domains() {
    return require('./commands/bin/domains')
  },
  get rm() {
    return require('./commands/bin/remove')
  },
  get remove() {
    return require('./commands/bin/remove')
  },
  get whoami() {
    return require('./commands/bin/whoami')
  },
  get secrets() {
    return require('./commands/bin/secrets')
  },
  get logs() {
    return require('./commands/bin/logs')
  },
  get upgrade() {
    return require('./commands/bin/upgrade')
  },
  get teams() {
    return require('./commands/bin/teams')
  },
  get switch() {
    return require('./commands/bin/teams')
  }
}
