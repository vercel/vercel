const {basename, resolve: resolvePath} = require('path')
const chalk = require('chalk')
const {readFile} = require('fs-promise')
const {parse: parseDockerfile} = require('docker-file-parser')

const listPackage = {
  scripts: {
    start: 'serve ./content'
  },
  dependencies: {
    serve: '^2.4.1'
  }
}

module.exports = getMetadata

async function getMetadata(path, {
  deploymentType = 'npm',
  deploymentName,
  quiet = false,
  strict = true,
  isStatic = false
}) {
  let pkg = {}
  let nowConfig = {}

  let name
  let description

  try {
    nowConfig = JSON.parse(await readFile(resolvePath(path, 'now.json')))
  } catch (err) {
    // if the file doesn't exist then that's fine; any other error bubbles up
    if (err.code !== 'ENOENT') {
      const e = Error(`Failed to read JSON in "${path}/now.json"`)
      e.userError = true
      throw e
    }
  }

  if (deploymentType === 'npm') {
    if (isStatic) {
      pkg = listPackage
    } else {
      try {
        pkg = JSON.parse(await readFile(resolvePath(path, 'package.json')))
      } catch (err) {
        const e = Error(`Failed to read JSON in "${path}/package.json"`)
        e.userError = true
        throw e
      }
    }

    if (strict && (!pkg.scripts || (!pkg.scripts.start && !pkg.scripts['now-start']))) {
      const e = Error('Missing `start` (or `now-start`) script in `package.json`. ' +
        'See: https://docs.npmjs.com/cli/start.')
      e.userError = true
      throw e
    }

    if (!deploymentName) {
      if (typeof pkg.name === 'string') {
        name = pkg.name
      } else {
        name = basename(path)

        if (!quiet && !isStatic) {
          console.log(`> No \`name\` in \`package.json\`, using ${chalk.bold(name)}`)
        }
      }
    }

    description = pkg.description
  } else if (deploymentType === 'docker') {
    let docker
    try {
      const dockerfile = await readFile(resolvePath(path, 'Dockerfile'), 'utf8')
      docker = parseDockerfile(dockerfile, {includeComments: true})
    } catch (err) {
      const e = Error(`Failed to parse "${path}/Dockerfile"`)
      e.userError = true
      throw e
    }

    if (strict && docker.length <= 0) {
      const e = Error('No commands found in `Dockerfile`')
      e.userError = true
      throw e
    }

    const labels = {}
    docker
    .filter(cmd => cmd.name === 'LABEL')
    .forEach(({args}) => {
      for (const key in args) {
        if (!{}.hasOwnProperty.call(args, key)) {
          continue
        }

        // unescape and convert into string
        try {
          labels[key] = JSON.parse(args[key])
        } catch (err) {
          const e = Error(`Error parsing value for LABEL ${key} in \`Dockerfile\``)
          e.userError = true
          throw e
        }
      }
    })

    if (!deploymentName) {
      if (labels.name) {
        name = labels.name
      } else {
        name = basename(path)

        if (!quiet) {
          console.log(`> No \`name\` LABEL in \`Dockerfile\`, using ${chalk.bold(name)}`)
        }
      }
    }

    description = labels.description
  }

  if (deploymentName) {
    name = deploymentName
  }

  // if the project has both a `now.json` and `now` Object in the `package.json`
  // file, then fail hard and let the user know that they need to pick one or the
  // other
  if (pkg.now) {
    throw new Error('Refusing to proceed with multiple Now configurations (`now.json` and `package.json`). Please pick only one, then try again!')
  }

  return {
    name,
    description,
    pkg,
    nowConfig
  }
}
