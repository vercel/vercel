const getUser = require('./get-user')
const NowTeams = require('./teams')
const param = require('./output/param')

const loginCommand = param('now login')
const TokenError = new Error(`Your access token has been revoked. You can log in again using ${loginCommand}.`)

TokenError.code = 'not_authorized'

module.exports = async function getContextName({ apiUrl, token, debug, currentTeam }) {
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

    return related.slug
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

  return user.username || user.email
}
