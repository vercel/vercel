module.exports = {
  title: 'now.sh',
  subcommands: new Set(['login', 'deploy', 'ls']),
  get deploy() {
    return require('./deploy')
  },
  get login() {
    return require('./login')
  }
}
