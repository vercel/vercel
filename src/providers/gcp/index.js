module.exports = {
  title: 'Google Cloud Platform',
  subcommands: new Set(['help', 'login', 'deploy', 'ls']),

  // we use getters for commands to lazily get code
  // and not bog down initialization
  get help() {
    return require('./help')
  },

  get deploy() {
    return require('./deploy')
  },

  get login() {
    return require('./login')
  }
}
