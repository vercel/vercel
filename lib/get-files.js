// Native
const {resolve} = require('path')

// Packages
const flatten = require('arr-flatten')
const unique = require('array-unique')
const ignore = require('ignore')
const _glob = require('glob')
const {stat, readdir, readFile} = require('fs-promise')

// Ours
const IGNORED = require('./ignored')

/**
 * Returns a list of files in the given
 * directory that are subject to be
 * synchronized for npm.
 *
 * @param {String} full path to directory
 * @param {String} contents of `package.json` to avoid lookup
 * @param {Object} options:
 *  - `limit` {Number|null} byte limit
 *  - `debug` {Boolean} warn upon ignore
 * @return {Array} comprehensive list of paths to sync
 */

async function npm(path, pkg, {
  limit = null,
  debug = false
} = {}) {
  const whitelist = pkg.now && pkg.now.files ? pkg.now.files : pkg.files
  const search_ = whitelist || ['.']

  // always include the "main" file
  if (pkg.main) {
    search_.push(pkg.main)
  }

  // convert all filenames into absolute paths
  const search = Array.prototype.concat.apply([], (await Promise.all(search_.map(file => glob(file, {cwd: path, absolute: true, dot: true})))))

  // compile list of ignored patterns and files
  const npmIgnore = await maybeRead(resolve(path, '.npmignore'), null)
  const gitIgnore = npmIgnore === null ?
    await maybeRead(resolve(path, '.gitignore')) :
    null

  const filter = ignore().add(
    IGNORED +
    '\n' +
    clearRelative(npmIgnore === null ? gitIgnore : npmIgnore)
  ).createFilter()

  const prefixLength = path.length + 1

  // the package.json `files` whitelist still
  // honors npmignores: https://docs.npmjs.com/files/package.json#files
  // but we don't ignore if the user is explicitly listing files
  // under the now namespace, or using files in combination with gitignore
  const overrideIgnores = (pkg.now && pkg.now.files) || (gitIgnore !== null && pkg.files)
  const accepts = overrideIgnores ?
    () => true :
    file => {
      const relativePath = file.substr(prefixLength)

      if (relativePath === '') {
        return true
      }

      const accepted = filter(relativePath)
      if (!accepted && debug) {
        console.log('> [debug] ignoring "%s"', file)
      }
      return accepted
    }

  // locate files
  if (debug) {
    console.time(`> [debug] locating files ${path}`)
  }

  const files = await explode(search, {
    accepts,
    limit,
    debug
  })

  if (debug) {
    console.timeEnd(`> [debug] locating files ${path}`)
  }

  // always include manifest as npm does not allow ignoring it
  // source: https://docs.npmjs.com/files/package.json#files
  files.push(asAbsolute('package.json', path))

  // get files
  return unique(files)
}

/**
 * Transform relative paths into absolutes,
 * and maintains absolutes as such.
 *
 * @param {String} maybe relative path
 * @param {String} parent full path
 */

const asAbsolute = function (path, parent) {
  if (path[0] === '/') {
    return path
  }

  return resolve(parent, path)
}

/**
 * Returns a list of files in the given
 * directory that are subject to be
 * sent to docker as build context.
 *
 * @param {String} full path to directory
 * @param {String} contents of `Dockerfile`
 * @param {Object} options:
 *  - `limit` {Number|null} byte limit
 *  - `debug` {Boolean} warn upon ignore
 * @return {Array} comprehensive list of paths to sync
 */

async function docker(path, {
  limit = null,
  debug = false
} = {}) {
  // base search path
  const search_ = ['.']

  // convert all filenames into absolute paths
  const search = search_.map(file => asAbsolute(file, path))

  const dockerIgnore = await maybeRead(resolve(path, '.dockerignore'), null)

  // compile list of ignored patterns and files
  const filter = ignore().add(
    IGNORED +
    '\n' +
    clearRelative(dockerIgnore === null ?
      await maybeRead(resolve(path, '.gitignore')) :
      dockerIgnore)
  ).createFilter()

  const prefixLength = path.length + 1
  const accepts = function (file) {
    const relativePath = file.substr(prefixLength)

    if (relativePath === '') {
      return true
    }

    const accepted = filter(relativePath)
    if (!accepted && debug) {
      console.log('> [debug] ignoring "%s"', file)
    }
    return accepted
  }

  // locate files
  if (debug) {
    console.time(`> [debug] locating files ${path}`)
  }

  const files = await explode(search, {accepts, limit, debug})

  if (debug) {
    console.timeEnd(`> [debug] locating files ${path}`)
  }

  // always include manifest as npm does not allow ignoring it
  // source: https://docs.npmjs.com/files/package.json#files
  files.push(asAbsolute('Dockerfile', path))

  // get files
  return unique(files)
}

const glob = async function (pattern, options) {
  return new Promise((resolve, reject) => {
    _glob(pattern, options, (error, files) => {
      if (error) {
        reject(error)
      } else {
        resolve(files)
      }
    })
  })
}

/**
 * Explodes directories into a full list of files.
 * Eg:
 *   in:  ['/a.js', '/b']
 *   out: ['/a.js', '/b/c.js', '/b/d.js']
 *
 * @param {Array} of {String}s representing paths
 * @param {Array} of ignored {String}s.
 * @param {Object} options:
 *  - `limit` {Number|null} byte limit
 *  - `debug` {Boolean} warn upon ignore
 * @return {Array} of {String}s of full paths
 */

const explode = async function (paths, {accepts, debug}) {
  const list = async file => {
    let path = file
    let s

    if (!accepts(file)) {
      return null
    }

    try {
      s = await stat(path)
    } catch (e) {
      // in case the file comes from `files` or `main`
      // and it wasn't specified with `.js` by the user
      path = file + '.js'

      try {
        s = await stat(path)
      } catch (e2) {
        if (debug) {
          console.log('> [debug] ignoring invalid file "%s"', file)
        }
        return null
      }
    }

    if (s.isDirectory()) {
      const all = await readdir(file)
      return many(all.map(subdir => asAbsolute(subdir, file)))
    } else if (!s.isFile()) {
      if (debug) {
        console.log('> [debug] ignoring special file "%s"', file)
      }
      return null
    }

    return path
  }

  const many = async all => {
    return await Promise.all(all.map(async file => {
      return await list(file)
    }))
  }

  return flatten((await many(paths))).filter(v => v !== null)
}

/**
 * Returns the contents of a file if it exists.
 *
 * @return {String} results or `''`
 */

const maybeRead = async function (path, default_ = '') {
  try {
    return (await readFile(path, 'utf8'))
  } catch (err) {
    return default_
  }
}

/**
 * Remove leading `./` from the beginning of ignores
 * because our parser doesn't like them :|
 */

const clearRelative = function (str) {
  return str.replace(/(\n|^)\.\//g, '$1')
}

module.exports = {
  npm,
  docker
}
