module.exports = {
  title: 'now.sh',
  subcommands: new Set(['login', 'deploy', 'ls', 'alias', 'scale']),
  get deploy() {
    return require('./deploy')
  },
  get login() {
    return require('./login')
  },
  get ls() {
    return require('./commands/bin/list')
  },
  get alias() {
    return require('./commands/bin/alias')
  },
  get scale() {
    return require('./commands/bin/scale')
  }
}
