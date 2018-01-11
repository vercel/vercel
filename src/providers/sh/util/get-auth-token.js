// returns the auth token found in the `ctx`
// received by subcommands for now.sh

const getAuthToken = (ctx) => {
  const { authConfig: { credentials } } = ctx
  const { token } = credentials.find(item => item.provider === 'sh')
  return token;
}

module.exports = getAuthToken;
