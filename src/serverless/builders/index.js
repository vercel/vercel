module.exports = {
  get nodejs() {
    return require('./nodejs')
  },
  get static() {
    return require('./static')
  },
  get go() {
    return require('./go')
  }
}
