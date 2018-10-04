// Packages
const chalk = require('chalk')

// Utilities
const wait = require('../../util/output/wait')
const listInput = require('../../util/input/list')
const success = require('../../util/output/success')
const info = require('../../util/output/info')
const error = require('../../util/output/error')
const param = require('../../util/output/param')
const {writeToConfigFile} = require('../../util/config-files')
const getUser = require('../../util/get-user');

const updateCurrentTeam = (config, newTeam) => {
  if (newTeam) {
    config.currentTeam = newTeam.id
  } else {
    delete config.currentTeam
  }

  writeToConfigFile(config)
}

module.exports = async function({ apiUrl, token, teams, args, config }) {
  let stopSpinner = wait('Fetching teams')
  const list = (await teams.ls()).teams

  let { currentTeam } = config
  const accountIsCurrent = !currentTeam

  stopSpinner()

  let stopUserSpinner = wait('Fetching user information')
  const user = await getUser({ apiUrl, token })

  stopUserSpinner()

  if (accountIsCurrent) {
    currentTeam = {
      slug: user.username || user.email
    }
  }

  if (args.length !== 0) {
    const desiredSlug = args[0]
    const newTeam = list.find(team => team.slug === desiredSlug)

    if (newTeam) {
      updateCurrentTeam(config, newTeam)
      console.log(success(`The team ${chalk.bold(newTeam.name)} (${newTeam.slug}) is now active!`))
      return 0
    }

    if (desiredSlug === user.username) {
      stopSpinner = wait('Saving')
      updateCurrentTeam(config)

      stopSpinner()
      console.log(success(`Your account (${chalk.bold(desiredSlug)}) is now active!`))
      return 0
    }

    console.error(error(`Could not find membership for team ${param(desiredSlug)}`))
    return 1
  }

  const choices = list.map(({ id, slug, name }) => {
    name = `${slug} (${name})`

    if (id === currentTeam) {
      name += ` ${chalk.bold('(current)')}`
    }

    return {
      name,
      value: slug,
      short: slug
    }
  })

  const suffix = accountIsCurrent ? ` ${chalk.bold('(current)')}` : ''

  const userEntryName = user.username
    ? `${user.username} (${user.email})${suffix}`
    : user.email

  choices.unshift({
    name: userEntryName,
    value: user.email,
    short: user.username
  })

  // Let's bring the current team to the beginning of the list
  if (!accountIsCurrent) {
    const index = choices.findIndex(choice => choice.value === currentTeam.slug)
    const choice = choices.splice(index, 1)[0]
    choices.unshift(choice)
  }

  let message

  if (currentTeam) {
    message = `Switch to:`
  }

  const choice = await listInput({
    message,
    choices,
    separator: false,
    eraseFinalAnswer: true
  })

  // Abort
  if (!choice) {
    console.log(info('No changes made'))
    return 0
  }

  const newTeam = list.find(item => item.slug === choice)

  // Switch to account
  if (!newTeam) {
    if (currentTeam.slug === user.username || currentTeam.slug === user.email) {
      console.log(info('No changes made'))
      return 0
    }

    stopSpinner = wait('Saving')
    updateCurrentTeam(config)

    stopSpinner()
    console.log(success(`Your account (${chalk.bold(choice)}) is now active!`))
    return 0
  }

  if (newTeam.slug === currentTeam.slug) {
    console.log(info('No changes made'))
    return 0
  }

  stopSpinner = wait('Saving')
  updateCurrentTeam(config, newTeam)

  stopSpinner()
  console.log(success(`The team ${chalk.bold(newTeam.name)} (${newTeam.slug}) is now active!`))
  return 0
}
