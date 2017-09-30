const readPkg = require('read-pkg')

module.exports = async function(apps) {
  let pkg
  try {
    pkg = await readPkg()
  } catch (err) {
    pkg = {}
  }

  return apps
    .map(([name, deps]) => {
      deps = deps.slice().sort((a, b) => {
        return b.created - a.created
      })
      return [name, deps]
    })
    .sort(([nameA, depsA], [nameB, depsB]) => {
      if (pkg.name === nameA) {
        return -1
      }

      if (pkg.name === nameB) {
        return 1
      }

      return depsB[0].created - depsA[0].created
    })
}
