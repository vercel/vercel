// Packages
const chalk = require('chalk')

// Utilities
const regexes = require('../../../../util/input/regexes')
const wait = require('../../../../util/output/wait')
const fatalError = require('../../../../util/fatal-error')
const cmd = require('../../../../util/output/cmd')
const info = require('../../../../util/output/info')
const stamp = require('../../../../util/output/stamp')
const param = require('../../../../util/output/param')
const { tick } = require('../../../../util/output/chars')
const rightPad = require('../../../../util/output/right-pad')
const textInput = require('../../../../util/input/text')
const eraseLines = require('../../../../util/output/erase-lines')
const success = require('../../../../util/output/success')
const error = require('../../../../util/output/error')

const validateEmail = data => {
  return regexes.email.test(data.trim()) || data.length === 0
}

const domains = Array.from(
  new Set([
    'aol.com',
    'gmail.com',
    'google.com',
    'yahoo.com',
    'ymail.com',
    'hotmail.com',
    'live.com',
    'outlook.com',
    'inbox.com',
    'mail.com',
    'gmx.com',
    'icloud.com'
  ])
)

const emailAutoComplete = (value, teamSlug) => {
  const parts = value.split('@')

  if (parts.length === 2 && parts[1].length > 0) {
    const [, host] = parts
    let suggestion = false

    domains.unshift(teamSlug)
    for (const domain of domains) {
      if (domain.startsWith(host)) {
        suggestion = domain.substr(host.length)
        break
      }
    }

    domains.shift()
    return suggestion
  }

  return false
}

module.exports = async function(
  { teams, args, config, introMsg, noopMsg = 'No changes made' } = {}
) {
  const { user, currentTeam } = config.sh

  domains.push(user.email.split('@')[1])

  if (!currentTeam) {
    let err = `You can't run this command under ${param(
      user.username || user.email
    )}.\n`
    err += `${chalk.gray('>')} Run ${cmd('now switch')} to choose to a team.`
    return fatalError(err)
  }

  console.log(info(introMsg || `Inviting team members to ${chalk.bold(currentTeam.name)}`))

  if (args.length > 0) {
    for (const email of args) {
      if (regexes.email.test(email)) {
        const stopSpinner = wait(email)
        const elapsed = stamp()
        // eslint-disable-next-line no-await-in-loop
        await teams.inviteUser({ teamId: currentTeam.id, email })
        stopSpinner()
        console.log(`${chalk.cyan(tick)} ${email} ${elapsed()}`)
      } else {
        console.log(`${chalk.red(`✖ ${email}`)} ${chalk.gray('[invalid]')}`)
      }
    }
    return
  }

  const inviteUserPrefix = rightPad('Invite User', 14)
  const emails = []
  let hasError = false
  let email
  do {
    email = ''
    try {
      // eslint-disable-next-line no-await-in-loop
      email = await textInput({
        label: `- ${inviteUserPrefix}`,
        validateValue: validateEmail,
        autoComplete: value => emailAutoComplete(value, currentTeam.slug)
      })
    } catch (err) {
      if (err.message !== 'USER_ABORT') {
        throw err
      }
    }
    let elapsed
    let stopSpinner
    if (email) {
      elapsed = stamp()
      stopSpinner = wait(inviteUserPrefix + email)
      try {
        // eslint-disable-next-line no-await-in-loop
        await teams.inviteUser({ teamId: currentTeam.id, email })
        stopSpinner()
        email = `${email} ${elapsed()}`
        emails.push(email)
        console.log(`${chalk.cyan(tick)} ${inviteUserPrefix}${email}`)
        if (hasError) {
          hasError = false
          process.stdout.write(eraseLines(emails.length + 2))
          console.log(info(
            introMsg ||
              `Inviting team members to ${chalk.bold(currentTeam.name)}`
          ))
          for (const email of emails) {
            console.log(`${chalk.cyan(tick)} ${inviteUserPrefix}${email}`)
          }
        }
      } catch (err) {
        stopSpinner()
        process.stdout.write(eraseLines(emails.length + 2))
        console.error(error(err.message))
        hasError = true
        for (const email of emails) {
          console.log(`${chalk.cyan(tick)} ${inviteUserPrefix}${email}`)
        }
      }
    }
  } while (email !== '')

  process.stdout.write(eraseLines(emails.length + 2))

  const n = emails.length
  if (emails.length === 0) {
    console.log(info(noopMsg))
  } else {
    console.log(success(`Invited ${n} team mate${n > 1 ? 's' : ''}`))
    for (const email of emails) {
      console.log(`${chalk.cyan(tick)} ${inviteUserPrefix}${email}`)
    }
  }
}
