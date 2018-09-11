// @flow

// Packages
const mri = require('mri')
const fs = require('fs-extra')
const chalk = require('chalk')
const init = require('@zeit/init')
const { resolve } = require('path')
const { highlight } = require('cli-highlight')

// Utilities
const logo = require('../../../../util/output/logo')
const promptBool = require('../../../../util/input/prompt-bool')

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now init`)}

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline('FILE')}   Path to the local ${'`now.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline('DIR')}    Path to the global ${'`.now`'} directory
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline('TOKEN')}        Login token
    -d, --debug                    Debug mode [off]
    -T, --team                     Set a custom team scope

  ${chalk.dim('Example:')}

  ${chalk.gray('–')} Generates a \`Dockerfile\` and \`now.json\` for your project

    ${chalk.cyan('$ now init')}
`)
}

function indent (str, prefix = '  ') {
  return str.split('\n').map(l => `${prefix}${l}`).join('\n')
}

async function loadJson (path) {
  let json = {}
  try {
    json = await fs.readJSON(path)
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err
    }
  }
  return json
}

// Options
let argv

module.exports = async function main (ctx: any): Promise<number> {
  argv = mri(ctx.argv.slice(2), {
    boolean: ['help', 'debug', 'yes'],
    alias: {
      help: 'h',
      debug: 'd',
      yes: 'y'
    }
  })

  argv._ = argv._.slice(1)

  if (argv.help || argv._[0] === 'help') {
    help()
    return 2
  }

  const dir = argv._[0] || process.cwd()

  const {
    dockerfile,
    projectType,
    deploymentType
  } = await init(dir)

  const nowJsonPath = resolve(dir, 'now.json')
  const dockerfilePath = resolve(dir, 'Dockerfile')

  // Modify the existing `now.json`, if one exists
  const nowJson = await loadJson(nowJsonPath)

  // Set the detected deployment type
  nowJson.type = deploymentType

  // Enable Cloud v2
  if (!nowJson.features) {
    nowJson.features = {}
  }
  nowJson.features.cloud = 'v2'
  const nowJsonString = JSON.stringify(nowJson, null, 2) + '\n'

  // Print results
  console.log(`
Detected Project Type: ${chalk.cyan(projectType)}

Deployment Type: ${chalk.cyan(deploymentType)}

Dockerfile:

${indent(highlight(dockerfile.trim(), { language: 'dockerfile' }))}

now.json:

${indent(highlight(nowJsonString.trim(), { language: 'json' }))}
`)

  const confirmation = argv.yes || await promptBool('Create the files?')

  if (confirmation) {
    await Promise.all([
      fs.writeFile(nowJsonPath, nowJsonString),
      fs.writeFile(dockerfilePath, dockerfile)
    ])
    console.log(`${chalk.cyan('> Success!')} Created ${chalk.bold('Dockerfile')} and ${chalk.bold('now.json')}`)
  } else {
    console.log()
  }

  return 0
}
