const getUser = require('./get-user')
const NowTeams = require('./teams')

module.exports = async function getContextName({ apiUrl, token, debug, currentTeam }) {
  if (currentTeam) {
    const teams = new NowTeams({ apiUrl, token, debug, currentTeam })
    const list = (await teams.ls()).teams
    const related = list.find(team => team.id === currentTeam)

    return related.slug
  }

  const user = await getUser({ apiUrl, token })
  return user.username || user.email
}
