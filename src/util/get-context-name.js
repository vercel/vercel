const getUser = require('./get-user')
const NowTeams = require('./teams')
const param = require('./output/param')

const loginCommand = param('now login')
const TokenError = new Error(`Your access token has been revoked. You can log in again using ${loginCommand}.`)

TokenError.code = 'not_authorized'

const output = (input, includePlatformVersion) => {
  const {slug, username, email, platformVersion} = input
  const contextName = slug || username || email

  if (includePlatformVersion) {
    return {
      platformVersion,
      contextName
    }
  }

  return contextName
}

module.exports = async function getContextName({ apiUrl, token, debug, currentTeam, includePlatformVersion }) {
  if (currentTeam) {
    let list = []

    try {
      const teams = new NowTeams({ apiUrl, token, debug })
      list = (await teams.ls()).teams
    } catch (err) {
      if (err.code === 'not_authorized') {
        throw TokenError
      }

      throw err
    }

    const related = list.find(team => team.id === currentTeam)

    if (!related) {
      const cmd = param('now switch')
      const error = new Error(`Your team was deleted. You can switch to a different one using ${cmd}.`)

      error.code = 'team_deleted'
      throw error
    }

    return output(related, includePlatformVersion)
  }

  let user = null

  try {
    user = await getUser({ apiUrl, token })
  } catch (err) {
    if (err.code === 'not_authorized') {
      throw TokenError
    }

    throw err
  }

  return output(user, includePlatformVersion)
}
