// Native
const { resolve } = require('path')

// Packages
const flatten = require('arr-flatten')
const ignore = require('ignore')
const _glob = require('glob')
const { stat, readdir, readFile } = require('fs-extra')

// Utilities
const IGNORED = require('./ignored')
const uniqueStrings = require('./unique-strings')
const getLocalConfigPath = require('../../../config/local-path')

const glob = async function(pattern, options) {
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
 * Will recursivly walk through a directory and return an array of the files found within.
 * @param {string} dir the directory to walk
 * @param {string} path the path to this directory
 * @param {Array[string]} filelist a list of files so far identified
 * @param {Object} options
 *  - `output` {Object} "output" helper object
 * @returns {Array}
 */
const walkSync = async (dir, path, filelist = [], { output } = {}) => {
  const { debug } = output
  const dirc = await readdir(asAbsolute(dir, path))
  for (let file of dirc) {
    file = asAbsolute(file, dir)
    try {
      const file_stat = await stat(file)
      filelist = file_stat.isDirectory()
        ? await walkSync(file, path, filelist, { output })
        : filelist.concat(file)
    } catch (e) {
      debug(`Ignoring invalid file ${file}`)
    }
  }
  return filelist
}

/**
 * Will return an array containing the expaneded list of all files included in the whitelist.
 * @param {Array[string]} whitelist array of files and directories to include.
 * @param {string} path the path of the deployment.
 * @param {Object} options
 *  - `output` {Object} "output" helper object
 * @returns {Array} the expanded list of whitelisted files.
 */
const getFilesInWhitelist = async function(
  whitelist,
  path,
  { output } = {}
) {
  const { debug } = output
  let files = []

  await Promise.all(
    whitelist.map(async file => {
      file = asAbsolute(file, path)
      try {
        const file_stat = await stat(file)
        if (file_stat.isDirectory()) {
          const dir_files = await walkSync(file, path, [], { output })
          files.push(...dir_files)
        } else {
          files.push(file)
        }
      } catch (e) {
        debug(`Ignoring invalid file ${file}`)
      }
    })
  )
  return files
}

/**
 * Remove leading `./` from the beginning of ignores
 * because our parser doesn't like them :|
 */

const clearRelative = function(str) {
  return str.replace(/(\n|^)\.\//g, '$1')
}

/**
 * Returns the contents of a file if it exists.
 *
 * @return {String} results or `''`
 */

const maybeRead = async function(path, default_ = '') {
  try {
    return await readFile(path, 'utf8')
  } catch (err) {
    return default_
  }
}

/**
 * Transform relative paths into absolutes,
 * and maintains absolutes as such.
 *
 * @param {String} maybe relative path
 * @param {String} parent full path
 */

const asAbsolute = function(path, parent) {
  if (path[0] === '/') {
    return path
  }

  return resolve(parent, path)
}

/**
 * Returns a list of files in the given
 * directory that are subject to be
 * synchronized for static deployments.
 *
 * @param {String} full path to directory
 * @param {Object} options:
 *  - `limit` {Number|null} byte limit
 *  - `output` {Object} "output" helper object
 * @return {Array} comprehensive list of paths to sync
 */

async function staticFiles(
  path,
  nowConfig = {},
  { limit = null, hasNowJson = false, output } = {}
) {
  const { debug, time } = output
  let files = []
  if (nowConfig.files && Array.isArray(nowConfig.files)) {
    files = await getFilesInWhitelist(nowConfig.files, path, { output })
  } else {
    // The package.json `files` whitelist still
    // honors ignores: https://docs.npmjs.com/files/package.json#files
    const search_ = ['.']
    // Convert all filenames into absolute paths
    const search = Array.prototype.concat.apply(
      [],
      await Promise.all(
        search_.map(file =>
          glob(file, { cwd: path, absolute: true, dot: true })
        )
      )
    )

    // Compile list of ignored patterns and files
    const gitIgnore = await maybeRead(resolve(path, '.gitignore'))

    const filter = ignore()
      .add(IGNORED + '\n' + clearRelative(gitIgnore))
      .add([ 'now.json', 'package.json', 'Dockerfile' ])
      .createFilter()

    const prefixLength = path.length + 1

    // The package.json `files` whitelist still
    // honors npmignores: https://docs.npmjs.com/files/package.json#files
    // but we don't ignore if the user is explicitly listing files
    // under the now namespace, or using files in combination with gitignore
    const accepts = file => {
      const relativePath = file.substr(prefixLength)

      if (relativePath === '') {
        return true
      }

      const accepted = filter(relativePath)

      if (!accepted) {
        debug(`Ignoring ${file}`)
      }

      return accepted
    }

    // Locate files
    files = await time(
      `Locating files ${path}`,
      explode(search, {
        accepts,
        limit,
        output
      })
    )
  }

  // Get files
  return uniqueStrings(files)
}

/**
 * Returns a list of files in the given
 * directory that are subject to be
 * synchronized for npm.
 *
 * @param {String} full path to directory
 * @param {String} contents of `package.json` to avoid lookup
 * @param {Object} options:
 *  - `limit` {Number|null} byte limit
 *  - `output` {Object} "output" helper object
 * @return {Array} comprehensive list of paths to sync
 */

async function npm(
  path,
  pkg = {},
  nowConfig = {},
  { limit = null, hasNowJson = false, output } = {}
) {
  const { debug, time } = output
  const whitelist = nowConfig.files || pkg.files || (pkg.now && pkg.now.files)
  let files = []

  if (whitelist) {
    files = await getFilesInWhitelist(whitelist, path, { output })
  } else {
    // The package.json `files` whitelist still
    // honors ignores: https://docs.npmjs.com/files/package.json#files
    const search_ = ['.']
    // Convert all filenames into absolute paths
    const search = Array.prototype.concat.apply(
      [],
      await Promise.all(
        search_.map(file =>
          glob(file, { cwd: path, absolute: true, dot: true })
        )
      )
    )

    // Compile list of ignored patterns and files
    const npmIgnore = await maybeRead(resolve(path, '.npmignore'), null)
    const gitIgnore =
      npmIgnore === null ? await maybeRead(resolve(path, '.gitignore')) : null

    const filter = ignore()
      .add(
        IGNORED +
          '\n' +
          clearRelative(npmIgnore === null ? gitIgnore : npmIgnore)
      )
      .createFilter()

    const prefixLength = path.length + 1

    // The package.json `files` whitelist still
    // honors npmignores: https://docs.npmjs.com/files/package.json#files
    // but we don't ignore if the user is explicitly listing files
    // under the now namespace, or using files in combination with gitignore
    const overrideIgnores =
      (pkg.now && pkg.now.files) ||
      nowConfig.files ||
      (gitIgnore !== null && pkg.files)
    const accepts = overrideIgnores
      ? () => true
      : file => {
          const relativePath = file.substr(prefixLength)

          if (relativePath === '') {
            return true
          }

          const accepted = filter(relativePath)
          if (!accepted) {
            debug(`Ignoring ${file}`)
          }
          return accepted
        }

    // Locate files
    files = await time(
      `Locating files ${path}`,
      explode(search, {
        accepts,
        limit,
        output
      })
    )
  }

  // Always include manifest as npm does not allow ignoring it
  // source: https://docs.npmjs.com/files/package.json#files
  files.push(asAbsolute('package.json', path))

  if (hasNowJson) {
    files.push(asAbsolute(getLocalConfigPath(path), path))
  }

  // Get files
  return uniqueStrings(files)
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
 *  - `output` {Object} "output" helper object
 * @return {Array} comprehensive list of paths to sync
 */

async function docker(
  path,
  nowConfig = {},
  { limit = null, hasNowJson = false, output } = {}
) {
  const { debug, time } = output
  let files = []

  if (nowConfig.files) {
    files = await getFilesInWhitelist(nowConfig.files, path, { output })
  } else {
    // Base search path
    // the now.json `files` whitelist still
    // honors ignores: https://docs.npmjs.com/files/package.json#files
    const search_ = ['.']

    // Convert all filenames into absolute paths
    const search = search_.map(file => asAbsolute(file, path))

    // Compile list of ignored patterns and files
    const dockerIgnore = await maybeRead(resolve(path, '.dockerignore'), null)

    const ignoredFiles = clearRelative(
      dockerIgnore === null
        ? await maybeRead(resolve(path, '.gitignore'))
        : dockerIgnore
    )

    const filter = ignore()
      .add(IGNORED + '\n' + ignoredFiles)
      .createFilter()

    const prefixLength = path.length + 1
    const accepts = function(file) {
      const relativePath = file.substr(prefixLength)

      if (relativePath === '') {
        return true
      }

      const accepted = filter(relativePath)
      if (!accepted) {
        debug(`Ignoring ${file}`)
      }
      return accepted
    }

    // Locate files
    files = await time(
      `Locating files ${path}`,
      explode(search, { accepts, limit, output })
    )
  }

  if (hasNowJson) {
    files.push(asAbsolute(getLocalConfigPath(path), path))
  }

  // Always include manifest as npm does not allow ignoring it
  // source: https://docs.npmjs.com/files/package.json#files
  files.push(asAbsolute('Dockerfile', path))

  // Get files
  return uniqueStrings(files)
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
 *  - `output` {Object} "output" helper object
 * @return {Array} of {String}s of full paths
 */

async function explode(paths, { accepts, output }) {
  const { debug } = output
  const list = async file => {
    let path = file
    let s

    if (!accepts(file)) {
      return null
    }

    try {
      s = await stat(path)
    } catch (e) {
      // In case the file comes from `files`
      // and it wasn't specified with `.js` by the user
      path = file + '.js'

      try {
        s = await stat(path)
      } catch (e2) {
        debug(`Ignoring invalid file ${file}`)
        return null
      }
    }

    if (s.isDirectory()) {
      const all = await readdir(file)
      /* eslint-disable no-use-before-define */
      return many(all.map(subdir => asAbsolute(subdir, file)))
      /* eslint-enable no-use-before-define */
    } else if (!s.isFile()) {
      debug(`Ignoring special file ${file}`)
      return null
    }

    return path
  }


  const many = all => Promise.all(all.map(file => list(file)))
  return flatten(await many(paths)).filter(v => v !== null)
}

module.exports = {
  npm,
  docker,
  staticFiles
}
