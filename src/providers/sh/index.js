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
    'secrets'
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
  }
}
