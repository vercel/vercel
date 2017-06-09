const _fetch = require('node-fetch')

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

  try {
    const res = await fetch(url, { headers })

    const json = await res.json()

    if (filter) {
      return _filter(json)
    }
    return json
  } catch (err) {
    console.error(err.stack)
    return null
  }
}

module.exports = {
  get,
  filter: _filter
}
