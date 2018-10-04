const getUser = require('./get-user')
const NowTeams = require('./teams')
const wait = require('./output/wait')

module.exports = async function getContextName({ apiUrl, token, debug, currentTeam }) {
  let stopSpinner = null

  if (currentTeam) {
    stopSpinner = wait('Fetching team information')

    const teams = new NowTeams({ apiUrl, token, debug, currentTeam })
    const list = (await teams.ls()).teams
    const related = list.find(team => team.id === currentTeam)

    stopSpinner()

    return related.slug
  }

  stopSpinner = wait('Fetching user information')
  const user = await getUser({ apiUrl, token })
  stopSpinner()

  return user.username || user.email
}
