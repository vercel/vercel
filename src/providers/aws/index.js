module.exports = {
  title: 'AWS Lambda',
  subcommands: new Set(['help', 'login', 'deploy', 'ls']),
  get deploy() {
    return require('./deploy')
  },
  get help() {
    return require('./help')
  },
  get login() {
    return require('./login')
  }
}
