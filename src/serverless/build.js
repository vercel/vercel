const builders = require('./builders')

const build = (dir, desc, opts) => {
  return builders[desc.type](dir, desc, opts)
}

module.exports = build
