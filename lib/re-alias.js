// Native
const {join} = require('path')

// Packages
const fs = require('fs-promise')
const publicSuffixList = require('psl')
const chalk = require('chalk')

// Ours
const {error} = require('./error')
const readMetaData = require('./read-metadata')
const NowAlias = require('./alias')

exports.assignAlias = async (autoAlias, token, deployment, apiUrl, debug) => {
  const type = publicSuffixList.isValid(autoAlias) ? 'alias' : 'uid'

  const aliases = new NowAlias(apiUrl, token, {debug})
  const list = await aliases.ls()

  let related

  // Check if alias even exists
  for (const alias of list) {
    if (alias[type] === autoAlias) {
      related = alias
      break
    }
  }

  // If alias doesn't exist
  if (!related) {
    // Check if the uid was actually an alias
    if (type === 'uid') {
      return exports.assignAlias(`${autoAlias}.now.sh`, token, deployment)
    }

    // If not, throw an error
    const withID = type === 'uid' ? 'with ID ' : ''
    error(`Alias ${withID}"${autoAlias}" doesn't exist`)
    return
  }

  console.log(`> Assigning alias ${chalk.bold.underline(related.alias)} to deployment...`)

  // Assign alias
  await aliases.set(String(deployment), String(related.alias))
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
