// returns the team name, user username or email in its absence
// for the current context

module.exports = function getContextName({ currentTeam, user }) {
  return currentTeam ?
    currentTeam.slug
    : user.username ?
      user.username
      : user.email
}
