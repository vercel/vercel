const _fetch = require('node-fetch')
const { responseError } = require('./error')

function _filter(data) {
  data = data.user

  return {
    uid: data.uid,
    username: data.username,
    email: data.email
  }
}

/**
 * Gets all the info we have about an user
 *
 * @param  {Object} fetch    Optionally, _our_ `fetch` can be passed here
 * @param  {String} token    Only necessary if `fetch` is undefined
 * @param  {String} apiUrl   Only necessary if `fetch` is undefined
 * @param  {Boolean} filter  If `true`, the `filter` used will to the data
 *                           before returning
 * @return {Object}
 */
async function get(
  { fetch, token, apiUrl = 'https://api.zeit.co', filter = true } = {}
) {
  let headers = {}
  const endpoint = '/www/user'
  const url = fetch ? endpoint : apiUrl + endpoint

  if (!fetch) {
    headers = {
      Authorization: `Bearer ${token}`
    }
    fetch = _fetch
  }

  const res = await fetch(url, { headers })

  if (res.status === 403) {
    const err = Error(
      'Your authentication token is invalid. Try running `now login` to log in again.'
    )
    err.userError = true
    throw err
  }

  if (res.status >= 400 && res.status < 500) {
    const err = await responseError(res)
    throw err
  }

  if (res.status !== 200) {
    throw new Error('API Error getting user data')
  }

  const json = await res.json()

  if (filter) {
    return _filter(json)
  }

  return json
}

module.exports = {
  get,
  filter: _filter
}
