const chalk = require('chalk')

const wait = require('../../lib/utils/output/wait')
const cfg = require('../../lib/cfg')
const info = require('../../lib/utils/output/info')
const error = require('../../lib/utils/output/error')
const { tick: tickChar } = require('../../lib/utils/output/chars')
const table = require('../../lib/utils/output/table')

module.exports = async function({ teams, token }) {
  const stopSpinner = wait('Fetching teams')
  const list = (await teams.ls()).teams
  let { user, currentTeam } = await cfg.read({ token })
  const accountIsCurrent = !currentTeam
  stopSpinner()

  if (accountIsCurrent) {
    currentTeam = {
      slug: user.username || user.email
    }
  }

  const teamList = list.map(({ slug, name }) => {
    return {
      name,
      value: slug,
      current: slug === currentTeam.slug ? tickChar : ''
    }
  })

  teamList.unshift({
    name: user.email,
    value: user.username || user.email,
    current: (accountIsCurrent && tickChar) || ''
  })

  // Let's bring the current team to the beginning of the list
  if (!accountIsCurrent) {
    const index = teamList.findIndex(
      choice => choice.value === currentTeam.slug
    )
    const choice = teamList.splice(index, 1)[0]
    teamList.unshift(choice)
  }

  // Printing
  const count = teamList.length
  if (!count) {
    // Maybe should not happen
    error(`No team found`)
    return
  }

  info(`${chalk.bold(count)} team${count > 1 ? 's' : ''} found`)
  console.log()

  table(
    ['', 'id', 'email / name'],
    teamList.map(team => [team.current, team.value, team.name]),
    [1, 5]
  )
}
