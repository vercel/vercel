const resolvers = require('./resolvers')
const resolverNames = Object.keys(resolvers)

const resolve = async (param, opts) => {
  for (const name of resolverNames) {
    const resolver = resolvers[name]
    let resolved

    // give the caller the ability to create
    // nicer errors by attaching the resolver name
    try {
      resolved = await resolver(param, opts)
    } catch (err) {
      err.resolverName = name
      throw err
    }

    if (resolved !== null) {
      return resolved
    }
    // otherwise continue onto the next resolver
    // note: if a resolver throws, we consider that
    // unexpected. a resolver should return `null`
    // when the parameter is unresolvable instead
  }
  return null
}
module.exports = resolve
