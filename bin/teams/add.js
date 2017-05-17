// Packages
const chalk = require('chalk')

// Ours
const stamp = require('../../lib/utils/output/stamp')
const info = require('../../lib/utils/output/info')
const error = require('../../lib/utils/output/error')
const wait = require('../../lib/utils/output/wait')
const rightPad = require('../../lib/utils/output/right-pad')
const eraseLines = require('../../lib/utils/output/erase-lines')
const { tick } = require('../../lib/utils/output/chars')
const success = require('../../lib/utils/output/success')
const cmd = require('../../lib/utils/output/cmd')
const note = require('../../lib/utils/output/note')
const uid = require('../../lib/utils/output/uid')
const textInput = require('../../lib/utils/input/text')
const exit = require('../../lib/utils/exit')
const cfg = require('../../lib/cfg')

function validateSlugKeypress(data, value) {
  // TODO: the `value` here should contain the current value + the keypress
  // should be fixed on utils/input/text.js
  return /^[a-zA-Z]+[a-zA-Z0-9_-]*$/.test(value + data)
}

function gracefulExit() {
  console.log() // Blank line
  note(
    `Your team is now active for all ${cmd('now')} commands!\n  Run ${cmd('now switch')} to change it in the future.`
  )
  return exit()
}

const teamUrlPrefix = rightPad('Team URL', 14) + chalk.gray('zeit.co/')
const teamNamePrefix = rightPad('Team Name', 14)

module.exports = async function({ teams, token }) {
  let slug
  let team
  let elapsed
  let stopSpinner

  info(
    `Pick a team identifier for its url (e.g.: ${chalk.cyan('`zeit.co/acme`')})`
  )
  do {
    try {
      // eslint-disable-next-line no-await-in-loop
      slug = await textInput({
        label: `- ${teamUrlPrefix}`,
        validateKeypress: validateSlugKeypress,
        initialValue: slug,
        valid: team,
        forceLowerCase: true
      })
    } catch (err) {
      if (err.message === 'USER_ABORT') {
        info('Aborted')
        return exit()
      }
      throw err
    }
    elapsed = stamp()
    stopSpinner = wait(teamUrlPrefix + slug)

    let res
    try {
      // eslint-disable-next-line no-await-in-loop
      res = await teams.create({ slug })
      stopSpinner()
      team = res
    } catch (err) {
      stopSpinner()
      eraseLines(2)
      error(err.message)
    }
  } while (!team)

  eraseLines(2)
  success(`Team created ${uid(team.id)} ${elapsed()}`)
  console.log(chalk.cyan(`${tick} `) + teamUrlPrefix + slug + '\n')

  info('Pick a display name for your team')
  let name
  try {
    name = await textInput({
      label: `- ${teamNamePrefix}`,
      validateValue: value => value.trim().length > 0
    })
  } catch (err) {
    if (err.message === 'USER_ABORT') {
      info('No name specified')
      gracefulExit()
    } else {
      throw err
    }
  }
  elapsed = stamp()
  stopSpinner = wait(teamNamePrefix + name)
  const res = await teams.edit({ id: team.id, name })
  stopSpinner()

  eraseLines(2)
  if (res.error) {
    error(res.error.message)
    console.log(`${chalk.red(`✖ ${teamNamePrefix}`)}${name}`)
    exit(1)
    // TODO: maybe we want to ask the user to retry? not sure if
    // there's a scenario where that would be wanted
  }

  team = Object.assign(team, res)

  success(`Team name saved ${elapsed()}`)
  console.log(chalk.cyan(`${tick} `) + teamNamePrefix + team.name + '\n')

  stopSpinner = wait('Saving')
  await cfg.merge({ currentTeam: team })
  stopSpinner()

  await require('./invite')({
    teams,
    args: [],
    token,
    introMsg: 'Invite your team mates! When done, press enter on an empty field',
    noopMsg: `You can invite team mates later by running ${cmd('now teams invite')}`
  })

  gracefulExit()
}
