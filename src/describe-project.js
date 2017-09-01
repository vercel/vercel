// Native
const { join, basename } = require('path')

// Packages
const { existsSync, stat, readFile } = require('fs-extra')

const describeProject = async path => {
  let nowJSON = null
  let packageJSON = null

  const s = await stat(path)
  if (s.isFile()) {
    throw new Error(
      'Deploying files directly is coming! Please supply a directory'
    )
  }

  const nowJSONPath = join(path, 'now.json')

  if (existsSync(nowJSONPath)) {
    nowJSON = JSON.parse(await readFile(nowJSONPath))
  }

  const packageJSONPath = join(path, 'package.json')

  if (existsSync(packageJSONPath)) {
    packageJSON = JSON.parse(await readFile(packageJSONPath))
  }

  if (packageJSON && packageJSON.now && nowJSON) {
    const err = new Error(
      'Ambigous config: package.json (with `now` field) and now.json'
    )
    err.code = 'AMBIGOUS_CONFIG'
    err.files = ['package.json', 'now.json']
    throw err
  }

  if (nowJSON && (nowJSON.type === 'npm' || nowJSON.type === 'node')) {
    console.log(
      'DEPRECATED: `npm` and `node` types should be `nodejs` in `now.json`'
    )
    nowJSON.type = 'nodejs'
  }

  // npm has a convention that `npm start`, if not defined,
  // will invoke `node server.js`
  const hasServerJSFile = existsSync(join(path, 'server.js'))

  // we support explicit definition of nodejs as a type, or we
  // guess it based on `package.json` or
  if (
    (nowJSON && nowJSON.type === 'nodejs') ||
    ((!nowJSON || !nowJSON.type) && (packageJSON || hasServerJSFile))
  ) {
    return {
      name: getName(path, nowJSON, packageJSON),
      description: getDescription(nowJSON, packageJSON),
      type: 'nodejs',
      nowJSON,
      packageJSON,
      hasServerJSFile
    }
  }

  if (nowJSON && nowJSON.type) {
    return {
      name: getName(path, nowJSON),
      description: getDescription(nowJSON),
      type: nowJSON.type,
      nowJSON
    }
  } else if (existsSync(join(path, 'main.go'))) {
    return {
      name: getName(path, nowJSON),
      description: getDescription(nowJSON),
      type: 'go'
    }
  } else {
    return {
      type: 'static'
    }
  }
}

const getName = (path, nowJSON = null, packageJSON = null) => {
  if (nowJSON && nowJSON.name != null) {
    return nowJSON.name.toLowerCase()
  }

  if (packageJSON && packageJSON.name != null) {
    return packageJSON.name.toLowerCase()
  }

  return basename(path).replace(/[^\w]+/g, '-').toLowerCase()
}

const getDescription = (nowJSON = null, packageJSON = null) => {
  if (nowJSON && nowJSON.description != null) {
    return nowJSON.description
  }

  if (packageJSON && packageJSON.name != null) {
    return packageJSON.description
  }

  return null
}

module.exports = describeProject
