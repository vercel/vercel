// Native
const { basename, resolve: resolvePath } = require('path')

// Packages
const chalk = require('chalk')
const { readFile } = require('fs-extra')
const { parse: parseDockerfile } = require('docker-file-parser')
const determineType = require('deployment-type')

module.exports = readMetaData

async function readMetaData(
  path,
  {
    deploymentType,
    deploymentName,
    sessionAffinity,
    quiet = false,
    strict = true
  }
) {
  let description
  let type = deploymentType
  let name = deploymentName
  let affinity = sessionAffinity

  const pkg = await readJSON(path, 'package.json')
  let nowConfig = await readJSON(path, 'now.json')
  const dockerfile = await readDockerfile(path)

  const hasNowJson = Boolean(nowConfig)

  if (pkg && pkg.now) {
    // If the project has both a `now.json` and `now` Object in the `package.json`
    // file, then fail hard and let the user know that they need to pick one or the
    // other
    if (nowConfig) {
      const err = new Error(
        'You have a `now` configuration field inside `package.json` ' +
          'but configuration is also present in `now.json`! ' +
          "Please ensure there's a single source of configuration by removing one."
      )
      err.userError = true
      throw err
    } else {
      nowConfig = pkg.now
    }
  }

  // We can remove this once the prompt for choosing `--npm` or `--docker` is gone
  if (pkg && pkg.now && pkg.now.type) {
    type = nowConfig.type
  }

  // The same goes for this
  if (nowConfig && nowConfig.type) {
    type = nowConfig.type
  }

  if (!type) {
    type = await determineType(path)

    // Both `package.json` and `Dockerfile` exist! Prompt the user to pick one.
    // We can remove this soon (details are internal) - also read the comment paragraph above
    if (type === 'docker' && (pkg && dockerfile)) {
      const err = new Error(
        'Ambiguous deployment (`package.json` and `Dockerfile` found). ' +
          'Please supply `--npm` or `--docker` to disambiguate.'
      )

      err.userError = true
      err.code = 'MULTIPLE_MANIFESTS'

      throw err
    }
  }

  if (!name && nowConfig) {
    name = nowConfig.name
  }

  if (!affinity && nowConfig) {
    affinity = nowConfig.sessionAffinity
  }

  if (type === 'npm') {
    if (pkg) {
      if (!name && pkg.now && pkg.now.name) {
        name = String(pkg.now.name)
      }

      if (!name && pkg.name) {
        name = String(pkg.name)
      }

      description = pkg.description
    }
  } else if (type === 'docker') {
    if (strict && dockerfile.length <= 0) {
      const err = new Error('No commands found in `Dockerfile`')
      err.userError = true

      throw err
    }

    const labels = {}

    dockerfile.filter(cmd => cmd.name === 'LABEL').forEach(({ args }) => {
      for (const key in args) {
        if (!{}.hasOwnProperty.call(args, key)) {
          continue
        }

        // Unescape and convert into string
        try {
          labels[key] = args[key]
        } catch (err) {
          const e = new Error(
            `Error parsing value for LABEL ${key} in \`Dockerfile\``
          )

          e.userError = true
          throw e
        }
      }
    })

    if (!name) {
      name = labels.name
    }

    description = labels.description
  } else if (type === 'static') {
    // Do nothing
  } else {
    throw new TypeError(`Unsupported "deploymentType": ${type}`)
  }

  // No name in `package.json` / `now.json`, or "name" label in Dockerfile.
  // Default to the basename of the root dir
  if (!name) {
    name = basename(path)

    if (!quiet && type !== 'static') {
      if (type === 'docker') {
        console.log(
          `> No \`name\` LABEL in \`Dockerfile\`, using ${chalk.bold(name)}`
        )
      } else {
        console.log(
          `> No \`name\` in \`package.json\`, using ${chalk.bold(name)}`
        )
      }
    }
  }

  return {
    name,
    description,
    type,
    pkg,
    nowConfig,
    hasNowJson,

    // XXX: legacy
    deploymentType: type,
    sessionAffinity: affinity
  }
}

async function readJSON(path, name) {
  try {
    const contents = await readFile(resolvePath(path, name), 'utf8')
    return JSON.parse(contents)
  } catch (err) {
    // If the file doesn't exist then that's fine; any other error bubbles up
    if (err.code !== 'ENOENT') {
      err.userError = true
      throw err
    }
  }
}

async function readDockerfile(path, name = 'Dockerfile') {
  try {
    const contents = await readFile(resolvePath(path, name), 'utf8')
    return parseDockerfile(contents, { includeComments: true })
  } catch (err) {
    // If the file doesn't exist then that's fine; any other error bubbles up
    if (err.code !== 'ENOENT') {
      err.userError = true
      throw err
    }
  }
}
