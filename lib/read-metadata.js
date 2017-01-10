const {basename, resolve: resolvePath} = require('path')
const chalk = require('chalk')
const {readFile} = require('fs-promise')
const {parse: parseDockerfile} = require('docker-file-parser')

const listPackage = {
  version: '0.0.0',
  scripts: {
    start: 'serve ./content'
  },
  dependencies: {
    serve: 'latest'
  }
}

module.exports = async function (path, {
  deploymentType = 'npm',
  deploymentName,
  quiet = false,
  isStatic = false
}) {
  let pkg = {}

  let name
  let description

  if (deploymentType === 'npm') {
    if (isStatic) {
      pkg = listPackage
    } else {
      try {
        pkg = await readFile(resolvePath(path, 'package.json'))
        pkg = JSON.parse(pkg)
      } catch (err) {
        const e = Error(`Failed to read JSON in "${path}/package.json"`)
        e.userError = true
        throw e
      }
    }

    if (!pkg.scripts || (!pkg.scripts.start && !pkg.scripts['now-start'])) {
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

    if (docker.length <= 0) {
      const e = Error('No commands found in `Dockerfile`')
      e.userError = true
      throw e
    }

    if (!docker.some(cmd => cmd.name === 'CMD')) {
      const e = Error('No `CMD` found in `Dockerfile`. ' +
        'See: https://docs.docker.com/engine/reference/builder/#/cmd')
      e.userError = true
      throw e
    }

    if (!docker.some(cmd => cmd.name === 'EXPOSE')) {
      const e = Error('No `EXPOSE` found in `Dockerfile`. A port must be supplied. ' +
        'See: https://docs.docker.com/engine/reference/builder/#/expose')
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

  return {
    name,
    description,
    pkg
  }
}
