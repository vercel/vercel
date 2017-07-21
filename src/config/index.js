module.exports = {
  subcommands: new Set(['help', 'set']),

  get help() {
    return require('./help')
  },

  get set() {
    return require('./set')
  }
}
