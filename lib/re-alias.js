// Native
const {join} = require('path')

// Packages
const fs = require('fs-promise')
const chalk = require('chalk')

// Ours
const {error} = require('./error')
const readMetaData = require('./read-metadata')
const NowAlias = require('./alias')

exports.assignAlias = async (autoAlias, token, deployment, apiUrl, debug) => {
  const aliases = new NowAlias(apiUrl, token, {debug})
  console.log(`> Assigning alias ${chalk.bold.underline(autoAlias)} to deployment...`)

  // Assign alias
  await aliases.set(String(deployment), String(autoAlias))
}

exports.reAlias = async (token, host, help, exit) => {
  const path = process.cwd()

  const configFiles = {
    pkg: join(path, 'package.json'),
    nowJSON: join(path, 'now.json')
  }

  if (!fs.existsSync(configFiles.pkg) && !fs.existsSync(configFiles.nowJSON)) {
    error(`Couldn't find a now.json or package.json file with an alias list in it`)
    return
  }

  const {nowConfig} = await readMetaData(path, {
    deploymentType: 'npm', // hard coding settings…
    quiet: true // `quiet`
  })

  const targets = nowConfig && nowConfig.aliases

  // the user never intended to support aliases from the package
  if (!targets || !Array.isArray(targets)) {
    help()
    return exit(0)
  }

  for (const target of targets) {
    await exports.assignAlias(target, token, host)
  }
}
